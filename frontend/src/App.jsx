import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header.jsx';
import RamMeter from './components/RamMeter.jsx';
import FileUpload from './components/FileUpload.jsx';
import ProgressTracker from './components/ProgressTracker.jsx';
import SuspectTable from './components/SuspectTable.jsx';
import SecurityReport from './components/SecurityReport.jsx';
import EvidenceModal from './components/EvidenceModal.jsx';
import { api } from './services/api.js';

export default function App() {
  // Application State
  const [systemHealth, setSystemHealth] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [activeModel, setActiveModel] = useState('qwen2.5:1.5b');

  // Job & Execution State
  const [currentJob, setCurrentJob] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [finalReport, setFinalReport] = useState(null);
  const [workingSuspects, setWorkingSuspects] = useState({});
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  const eventSourceRef = useRef(null);

  // Poll system metrics and model status every 2.5 seconds
  useEffect(() => {
    const fetchSystemInfo = async () => {
      try {
        const [m, h] = await Promise.all([
          api.getSystemMetrics(activeModel).catch(() => null),
          api.getSystemModels().catch(() => null)
        ]);
        if (m) setMetrics(m);
        if (h) setSystemHealth(h);
      } catch (_) {}
    };

    fetchSystemInfo();
    const interval = setInterval(fetchSystemInfo, 2500);
    return () => clearInterval(interval);
  }, [activeModel]);

  // Clean up EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  /**
   * Subscribes to live SSE progress events for a running job.
   */
  const subscribeToJobStream = (jobId) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    eventSourceRef.current = api.connectStream(jobId, {
      onProgress: (data) => {
        setAnalysisProgress(data);
        if (data.modelUsed) setActiveModel(data.modelUsed);
      },
      onFallback: (data) => {
        console.warn(`[Fallback] Switched from ${data.fromModel} to ${data.toModel}`);
        setActiveModel(data.toModel);
      },
      onCompleted: async (completedData) => {
        try {
          const report = await api.getReport(jobId);
          setFinalReport(report);
          const updatedJob = await api.getJob(jobId);
          setCurrentJob(updatedJob);
          setAnalysisProgress(prev => ({
            ...prev,
            totalTokensProcessed: updatedJob?.metrics?.totalTokensProcessed || completedData?.totalTokensProcessed || report?.summary?.totalTokensProcessed || prev?.totalTokensProcessed
          }));
        } catch (err) {
          console.error('Failed to load final report:', err);
        }
      },
      onFailed: (data) => {
        console.error('Analysis failed:', data.error);
        alert(`Analysis halted: ${data.error}`);
      }
    });
  };

  /**
   * 1-Click quick load of official Cultive8 log file.
   */
  const handleQuickLoad = async () => {
    setIsUploading(true);
    try {
      const job = await api.quickLoadTarget(activeModel);
      setCurrentJob(job);
      setFinalReport(null);
      setAnalysisProgress({
        chunkIndex: 0,
        totalChunks: job.totalChunks,
        percentComplete: 0
      });

      // Start sequential queue
      await api.startAnalysis(job.jobId);
      subscribeToJobStream(job.jobId);
    } catch (err) {
      console.error('Quick load error:', err);
      alert(`Could not quick-load target: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Handles custom file upload.
   */
  const handleUploadFile = async (file) => {
    setIsUploading(true);
    try {
      const job = await api.uploadFile(file, activeModel);
      setCurrentJob(job);
      setFinalReport(null);
      setAnalysisProgress({
        chunkIndex: 0,
        totalChunks: job.totalChunks,
        percentComplete: 0
      });

      // Start analysis
      await api.startAnalysis(job.jobId);
      subscribeToJobStream(job.jobId);
    } catch (err) {
      console.error('Upload error:', err);
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  /**
   * Resumes an interrupted job from its first incomplete chunk.
   */
  const handleResume = async () => {
    if (!currentJob) return;
    setIsResuming(true);
    try {
      await api.resumeAnalysis(currentJob.id || currentJob.jobId);
      subscribeToJobStream(currentJob.id || currentJob.jobId);
    } catch (err) {
      console.error('Resume error:', err);
      alert(`Resume failed: ${err.message}`);
    } finally {
      setIsResuming(false);
    }
  };

  /**
   * Resets view to upload screen for a new analysis.
   */
  const handleReset = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setCurrentJob(null);
    setAnalysisProgress(null);
    setFinalReport(null);
    setWorkingSuspects({});
  };

  // Derive active view: 'UPLOAD' | 'ANALYZING' | 'REPORT'
  const isAnalyzing = currentJob && !finalReport;
  const isReportReady = !!finalReport;

  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#f5efe6] flex flex-col font-sans selection:bg-[#38bdf8] selection:text-[#0a0c10]">
      {/* Sticky Header */}
      <Header
        systemHealth={systemHealth}
        metrics={metrics}
        activeModel={activeModel}
        onReset={handleReset}
        currentJob={currentJob}
      />

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Always visible: 4 GB RAM Monitor */}
        <RamMeter
          metrics={metrics}
          lastLatencyMs={analysisProgress?.latencyMs || currentJob?.metrics?.totalLatencyMs}
          totalTokensProcessed={analysisProgress?.totalTokensProcessed || currentJob?.metrics?.totalTokensProcessed || finalReport?.summary?.totalTokensProcessed}
        />

        {/* View 1: Upload & 1-Click Quick Load Screen */}
        {!currentJob && (
          <FileUpload
            onUploadFile={handleUploadFile}
            onQuickLoad={handleQuickLoad}
            isUploading={isUploading}
          />
        )}

        {/* View 2: Live Analysis Progress */}
        {isAnalyzing && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <ProgressTracker
              progress={analysisProgress}
              job={currentJob}
              onResume={handleResume}
              isResuming={isResuming}
            />

            {/* Live Cross-Chunk Memory Table */}
            <SuspectTable suspects={currentJob?.workingState?.suspects || {}} />
          </div>
        )}

        {/* View 3: Final Synthesized Security Audit Report */}
        {isReportReady && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <SecurityReport
              report={finalReport}
              onSelectEvidence={(finding) => setSelectedEvidence(finding)}
            />

            {/* Cross-Chunk Suspect Memory Table */}
            <SuspectTable suspects={currentJob?.workingState?.suspects || {}} />
          </div>
        )}
      </main>

      {/* Line-by-Line Evidence Inspector Modal */}
      <EvidenceModal
        finding={selectedEvidence}
        onClose={() => setSelectedEvidence(null)}
      />

      {/* Footer */}
      <footer className="border-t border-[#1f2735] bg-[#0c0f15]/80 py-6 text-center text-xs text-[#9e9282]">
        <p>
          Local AI Security Log Analyzer • Pure CPU Inference (2 vCPU, No GPU) • Offline Safe
        </p>
      </footer>
    </div>
  );
}
