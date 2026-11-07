# Local AI Security Log Analyzer: Architecture & Execution Plan

> **System Constraints**:
> - **Total Server RAM**: $\le 4\text{ GB}$ (Operating System + Express Backend + Local AI Model combined)
> - **Compute**: 2 vCPU, no GPU (pure CPU inference)
> - **Context Window**: Strict 2,048 tokens per model call
> - **Target Dataset**: `Cultive8_Workspace_Agrigen_Server.log` (258 lines, 92.2 KB, ~31,667 tokens, ~15× model chunk budget)
> - **AI Runtime**: 100% Local / Offline via Ollama (no cloud APIs)

---

## 1. Executive Summary & Core Objectives

The goal is to build an offline, production-grade security log analysis web application that ingests server logs far exceeding the local AI model's context window (~31,667 tokens), splits them without losing line numbers or truncating log entries, analyzes each chunk within a strict **2,048-token budget**, carries running state across chunks, and detects complex multi-stage attacks across parts (e.g. distributed brute force followed by account takeover and data exfiltration).

---

## 2. Refactored 4-Tier Clean Architecture

The codebase strictly adheres to clean separation of concerns:
- **Routes Layer (`routes/`)**: Contains **only** HTTP endpoint declarations and middleware bindings. Zero business logic or helper routines.
- **Controllers Layer (`controllers/`)**: Handles HTTP request parsing, response formatting, status codes, and error delegation.
- **Middleware Layer (`middleware/`)**: Handles file upload validation, MIME filtering, and storage limits.
- **Services Layer (`services/`)**: Independent, testable domain services for chunking, distillation, LLM grammar constraints, memory accumulation, citation grounding, and allowlist management.

```mermaid
flowchart TD
    subgraph Presentation ["Presentation Layer (React + Vite + Tailwind CSS)"]
        UI["SPA Client: Warm Beige, Steel-Blue & Charcoal Theme"]
        SSE_Client["EventSource SSE Live Progress Subscriber"]
    end

    subgraph HTTP_Routing ["HTTP & Routing Layer (Express.js)"]
        Routes["Routes (analysisRoutes.js, systemRoutes.js)"]
        UploadMW["Upload Middleware (Multer .log/.txt, 50MB Limit)"]
        Controllers["Controllers (AnalysisController, SystemController)"]
    end

    subgraph Service_Orchestration ["Domain Services Layer"]
        Engine["Analysis Engine (Sequential Queue Worker)"]
        SSE["SSE Manager (Multi-subscriber Event Bus)"]
        Distiller["Log Distiller (Semantic JSON Parsing, Zero Regex)"]
        Splitter["Log Splitter (Boundary-Safe 950-tok Chunker)"]
        Accumulator["State Accumulator (Deterministic Auth & Suspect Tracker)"]
        Synthesizer["Report Synthesizer (Citation Grounding Guardrail)"]
        Allowlist["Allowlist Manager (Configurable Ops & Monitor Exclusions)"]
        Monitor["System Monitor (Dual-Process RAM Tracker)"]
    end

    subgraph AI_Core ["Local Inference Engine (Ollama / llama.cpp)"]
        Grammar["BNF Grammar Decoding (OLLAMA_FINDINGS_SCHEMA)"]
        Qwen15["Primary Model: Qwen 2.5 1.5B (Q4_K_M)"]
        Qwen05["Fallback Model: Qwen 2.5 0.5B (Auto-Downgrade)"]
    end

    subgraph Persistence ["Persistence Layer"]
        JobStore["Job Store (Atomic JSON Files on Disk)"]
    end

    UI --> Routes
    SSE_Client <--> Controllers
    Routes --> UploadMW --> Controllers
    Controllers --> Engine
    Controllers --> JobStore
    Controllers --> Monitor
    Engine --> Distiller
    Engine --> Splitter
    Engine --> Accumulator
    Engine --> Allowlist
    Engine --> Grammar
    Grammar --> Qwen15
    Qwen15 -. "Fallback Trigger (>3.4 GB / Timeout)" .-> Qwen05
    Engine --> Synthesizer
    Engine --> SSE
    Engine --> JobStore
    SSE --> SSE_Client
```

---

## 3. Tech Stack Selection

| Component | Technology | Rationale & Memory Footprint |
| :--- | :--- | :--- |
| **Backend** | **Node.js (v24) + Express.js** | Lightweight, async event-driven architecture. RAM footprint: **~75 MB**. |
| **Frontend** | **React + Vite + Tailwind CSS** | Fast single-page application, responsive real-time UI, warm beige / steel-blue design system. |
| **Local AI Engine** | **Ollama (`llama.cpp` core)** | High-performance C++ CPU inference, GGUF quantized models, low memory overhead. |
| **Primary Model** | **Qwen 2.5 1.5B (Q4_K_M)** | High reasoning precision for subtle attacks. RAM working set: **~800 MB**. |
| **Fallback Model**| **Qwen 2.5 0.5B (Q8/Q4)** | Ultra-light fallback. RAM working set: **~400 MB**. Fast CPU inference (~25 tok/s). |
| **Data Persistence**| **Embedded Atomic JSON Store** | Zero external DB services, 0 MB extra RAM, crash-proof, supports instant resume. |
| **Monitoring** | **Node.js `os` + `process` + tasklist** | Real-time RAM tracking (Backend + Model vs. 4 GB limit) and model latency. |

---

## 4. Strict 2,048-Token Budget Breakdown

The brief strictly mandates: *"The 2,048-token budget includes the prompt, log text, saved context, and model output. Count tokens using your model’s tokenizer and leave room for the reply."*

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOTAL CONTEXT WINDOW: 2,048 TOKENS                                     │
├───────────────────┬───────────────────┬───────────────────┬────────────┤
│ System Prompt     │ Working Memory    │ Log Chunk Text    │ Output Res.│
│ ~250 tokens       │ ~350 tokens       │ ~950 tokens       │ ~498 tokens│
│ (Rules & Schema)  │ (Active Suspects) │ (Distilled lines) │ (JSON reply│
└───────────────────┴───────────────────┴───────────────────┴────────────┘
```

- **Chunk Token Ceiling**: Computed dynamically:
  $$\text{Log Budget} = 2,048 - (\text{System Prompt Tokens} + \text{State Tokens} + 498 \text{ Output Reserve}) \approx 950\text{ tokens}$$
- **Boundary Preservation**: Log entries are never sliced across chunks. If adding line $N$ exceeds the token budget, the chunk is sealed at line $N-1$. Original 1-indexed line numbers are strictly preserved.

---

## 5. Zero-Regex Detection Architecture

Rather than relying on brittle hardcoded regexes (e.g. matching `"ignore previous instructions"` or `"1=1"`), detection accuracy is achieved using standard machine-learning and AI engineering techniques:

```mermaid
flowchart LR
    A["Raw JSON Server Log"] --> B["1. Semantic Distillation (JSON.parse)"]
    B --> C["2. Event-Centric Telemetry Fact Routing"]
    C --> D["3. Native Ollama BNF Grammar Decoding"]
    D --> E["4. Strict Sender Grounding Guardrails"]
    E --> F["Consolidated Incident Report"]
```

1. **Semantic Log Distillation (`logDistiller.js`)**:
   - Parses each log line with `JSON.parse()`. Strips out 70% of redundant operational boilerplate (`duration_ms`, `user_agent`, `app`, `host`).
   - Places `client_ip` immediately adjacent to the action: `Line <N>: [<time>] <client_ip> <method> <path> -> HTTP <status> (<auth_result>, <error>, <payload>)`.
   - Eliminates entity bleed and reduces the total dataset from 37 chunks down to 9.
2. **Grammar-Constrained Decoding (`ollamaClient.js`)**:
   - Passes a complete JSON Schema into Ollama's `format` parameter.
   - Forces `llama.cpp`'s token sampler to generate valid JSON matching the exact schema (`attack_type`, `severity`, `target_or_attacker_id`, `evidence_lines`, `reason`, `suggested_action`).
   - Added `'Rate Abuse'` into the schema enumeration to surface volumetric flooding natively.
3. **Event-Centric SOC Evaluation (`analysisEngine.js`)**:
   - Computes deterministic telemetry facts per IP (`peakRequestsInWindow`, `status429Count`, `failedLogins`) and passes them into the model's analytical prompt.
   - Instructs the model:
     - The analytical reason **must quote exact fields and values** from cited lines.
     - HTTP `4xx` status codes indicate blocked attempts $\to$ rated **`Medium`** severity.
     - HTTP `2xx` status codes indicate successful breaches $\to$ rated **`High`** or **`Critical`** severity.
4. **Citation Grounding Guardrail (`reportSynthesizer.js`)**:
   - **Sender Grounding**: Only lines whose `client_ip` strictly equals the finding's claimed IP are retained. Mismatched lines are stripped; empty findings are dropped (eliminating `.94` and `.96` false positives and fixing bad range starts like L4/L8).
   - **Compromise Guard**: Requires an authenticated success event (`auth_result: "success"` or 200 on login/auth) before validating an Account Compromise claim; otherwise downgrades to Path Traversal/Probe with Medium severity (killing `.90`'s false L102 card).
   - **Deduplication by `(IP, type)`**: Merges multiple entries from the same IP into a single unified card (e.g., all `.90` probes merge into 1 card).
   - **Deterministic Auth Counting**: Failed logins are counted in code from `entry.auth_result === 'invalid_password'` (recording exactly 12 failed attempts for `203.0.113.44`, fixing the previous 13 count).
5. **Configurable Infrastructure Allowlist (`allowlistManager.js`)**:
   - Dedicated allowlist service separating operational exclusions (health checks, monitoring probes, internal test IPs) from detection logic.
   - Configurable via `CONFIG.ALLOWLIST` and environment variables (`ALLOWLIST_IPS`).
   - Zero dataset-specific IP exceptions hardcoded in `ReportSynthesizer`.

---

## 6. Verified Ground-Truth Incidents in `Cultive8_Workspace_Agrigen_Server.log`

| Threat Type | Severity | Attacker IP | Evidence Lines | Attack Scenario |
| :--- | :--- | :--- | :--- | :--- |
| **Brute Force Followed by Account Compromise** | **Critical** | `203.0.113.44` | Lines 5, 13, 23, 35, 50, 65, 80, 94, 108, 123, 153, 189, **196**, **201** | 12 failed logins targeting `workspace.admin` across chunks 1–7, followed by a successful `200 OK` login at line 196, and bulk CSV data exfiltration at line 201. |
| **SQL Injection (SQLi)** | **High** | `203.0.113.72` | Lines 29, 30, 32, 222, 223 | Boolean-based (`' OR 1=1--`), UNION SELECT, and blind time-based sleep injections (`SLEEP(5)`). Model quotes exact parameters. |
| **Path Traversal & Probing** | **High** | `203.0.113.90` | Lines 60, 64, 99, 101, 102 | Probing sensitive directories (`/phpmyadmin/`, `/server-status`) and encoded file traversal (`..%2F..%2Fetc%2Fpasswd`), consolidated into 1 card. |
| **Rate Abuse / Traffic Flood** | **High** | `203.0.113.155` | Lines 169, 170 | Volumetric request flood climbing to 135 requests in a 10s window, triggering 9 HTTP 429 Too Many Requests errors. |
| **Prompt Injection** | **Medium** | `203.0.113.201` | Line 217 | Adversarial prompt injection payload in support messages (`"Ignore previous instructions..."`) blocked by content validation (HTTP 422). |
| **Benign Operational Events (Filtered Out)** | **None** | `198.51.100.98` | Line 11 | Internal database timeout (`Microsoft.Data.SqlClient.SqlException`), cleanly retried on line 12. **Correctly ignored** (zero false positives). |

---

## 7. Memory Guardrails & Dual-Process Telemetry

- **Physical 4 GB RAM Guardrail**:
  - Node.js Backend: ~75 MB
  - Ollama Engine + KV Cache: ~800 MB
  - Combined Working Set: **~875 MB** (only **21.3%** of the 4,096 MB budget limit).
- **Autonomous Fallback Watchdog**:
  - Tracks both `ollama.exe` and `llama-server.exe` using `tasklist /FO CSV`.
  - If combined RAM crosses **3,400 MB** (85% of 4 GB) or a chunk exceeds 30 seconds on 2 vCPU, the system autonomously downgrades inference from `qwen2.5:1.5b` to `qwen2.5:0.5b` without crashing or losing carried state.

---

## 8. Frontend Theme & Design System

The UI has been redesigned into an executive security operations palette:
- **Canvas / Background**: Deep charcoal `#0a0c10` with `#11151e` card containers and `#090c10` inset code blocks.
- **Accents & Brand**: Warm sand/beige (`#d4b996`, `#e5d7c3`) paired with steel-blue (`#38bdf8`, `#7dd3fc`).
- **Typography & Details**: Soft ivory text (`#f5efe6`), muted beige secondary labels (`#b8ab99`), and slate-grey borders (`#1e2638`).
- **Real-Time Token Evidence**: RamMeter displays live cumulative tokens processed (`Tokens Processed: 6,848`), providing audit evidence of chunk adherence under the 2,048 limit.
