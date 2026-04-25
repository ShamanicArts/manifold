## 8. Open Problems and Future Directions

The preceding chapters traced a trajectory from Musique Concrète to CataRT, from handcrafted descriptors to CLAP embeddings, and from academic prototype to a single commercial plugin. Corpus-based concatenative synthesis retains fundamental blind spots—temporal, architectural, cultural, and legal—that will determine whether it becomes a standard creative tool or remains a niche academic instrument.

### 8.1 The Temporal Blind Spot: Rhythm, Meter, and Structure

Every canonical pipeline—CataRT, FluCoMa, Mosaïque, AudioGuide—privileges spectral and timbral descriptors. Pitch, loudness, spectral centroid, noisiness, and roughness describe what a sound is, not where it falls in metric time. There is no standard descriptor for onset phase relative to a beat grid, no metric position embedded in unit-selection criteria, and no segmentation strategy that preserves bar-level structure. Concatenative synthesis excels at texture and timbral evolution but struggles to produce metrically precise, rhythmically structured output.

The corrective path is visible but largely unbuilt. Beat tracking algorithms have not been integrated into unit selection as first-class criteria. Bayesian particle filter approaches achieve real-time selection with corpus-size-independent complexity; extending the hidden state to include metric phase is an open algorithmic problem. CoSaRef's authors identify polyphonic, multi-track generation as critical future work [^18^]; integrating transformer or LSTM sequence models with metric conditioning would address the blind spot directly.

### 8.2 Scalability and Corpus Architecture

Current systems operate on corpora measured in minutes or hours. Vector database libraries such as FAISS and ANNOY enable million-scale nearest-neighbor search in milliseconds [^39^][^40^], yet no concatenative synthesizer has deployed these backends at scale. The engineering gap—shard-based audio storage, distributed embedding computation, cloud-hosted retrieval—remains unaddressed.

A deeper problem is embedding durability. A corpus analyzed with CLAP 2023 embeddings produces a different topology than the same corpus analyzed with CLAP 2025 embeddings. Splice's production semantic search is actively updating its CLAP-based retrieval pipeline [^26^], and producers who organize libraries by embedding coordinates face a reproducibility crisis when the model changes. There is no standard for embedding versioning or backward-compatibility guarantee. The convergent architecture requires frozen software environments and pinned model weights; the field has not yet developed the equivalent of a lockfile for corpus topology.

### 8.3 Cross-Cultural and Non-Western Applications

The canonical descriptor vocabulary—brightness, roughness, noisiness, harmonicity—reflects Western psychoacoustic research on orchestral timbre. These terms map poorly onto the timbral categories of gagaku, raga, or mbira music. CLAP embeddings, trained predominantly on Western music and English-language captions, inherit this bias [^25^]. A corpus of Balinese gamelan analyzed through CLAP will be organized by similarity criteria that may not correspond to culturally meaningful relationships.

This bias is also an opportunity. Corpus-based methods are uniquely suited to preserve endangered sonic heritage: a small corpus of a ritual instrument can become a navigable timbre space. Concatenative synthesis produces rich output from corpora of minutes to hours, unlike generative models requiring massive training data. FreeSound hosts ethnographic field recordings under Creative Commons licenses [^8^], but no system has been designed for non-Western tuning systems or culturally specific segmentation rules.

### 8.4 Hardware, Edge Computing, and New Form Factors

The NeuroRave prototype embeds F-RAVE in Eurorack format using a Jetson Nano [^7^]; RAVE runs on Raspberry Pi 4 at sub-$100 price points [^11^]. AFTER operates on the same hardware but with 200–500 ms latency due to iterative diffusion denoising [^15^]. Concatenative search, however, remains memory-intensive: the corpus and its search structure must reside in RAM. An embedded instrument would require extreme compression via neural codecs such as SoundStream (3 kbps exceeding 12 kbps Opus quality) [^53^] or streaming from external storage. Neither approach has been demonstrated in a performable concatenative instrument.

Neuromorphic chips achieve up to 1000× energy efficiency on specific tasks [^42^], and an FPGA-based neuromorphic audio accelerator has demonstrated 71.11 Giga-Operations Per Second at 3.55 W [^43^]. No neuromorphic corpus nearest-neighbor search exists. Quantum computing offers a theoretical prospect—Grover's algorithm reduces unstructured search from O(N) to O(√N) [^45^]—but the advantage is contested when classical pre-processing is permitted [^46^]. Neuromorphic hardware may enable low-power embedded retrieval within five years; quantum acceleration remains speculative.

### 8.5 Toward a Convergent Future

#### 8.5.1 The Hybrid Synthesis Paradigm as Default Architecture

The evidence across this report points to a stable architectural equilibrium. Classical unit selection provides timbral identity and structural constraint; neural embeddings provide semantic retrieval; neural vocoders and diffusion models smooth transitions and refine output [^17^]; neural codecs compress corpora for streaming [^53^]. This is not a transitional state but a convergent architecture in which each component addresses a distinct failure mode of the others.

#### 8.5.2 Open Problems Severity Assessment

| Open Problem | Impact on Field | Time to Resolution | Current Attention | Severity |
|:---|:---|:---|:---|:---|
| Temporal/rhythmic structure in unit selection | High: limits role to texture/atmosphere | 3–5 years | Low: only MACataRT and The Concatenator address sequence structure | **Critical** |
| Copyright clearance for commercial corpora | High: single commercial plugin exists partly due to legal risk [^1^][^2^] | 5–10 years (legislative) | High: RIAA litigation, EU AI Act, FreeSound guidelines [^3^][^8^] | **Critical** |
| Embedding durability and corpus reproducibility | Medium-High: workflow instability when models update | 2–4 years | Low: no standard for embedding versioning | **High** |
| Million-scale distributed corpus search | Medium: enables new applications but not fundamental blocker | 2–3 years | Medium: FAISS/ANNOY mature but unintegrated [^39^][^40^] | **Moderate** |
| Cross-cultural descriptor vocabulary | Medium: limits global applicability | 5–10 years | Very low: no funded projects identified | **High** |
| Real-time diffusion refinement | Medium: quality improvement but adds latency [^18^] | 2–4 years | Medium: AFTER/BRAVE actively optimizing [^14^][^16^] | **Moderate** |
| Embedded concatenative instruments | Medium: would expand performance contexts | 3–5 years | Medium: NeuroRave/NeuroRack prove neural feasibility [^7^][^10^] | **Moderate** |
| Neuromorphic/quantum audio search | Low-Medium: speculative; classical alternatives adequate | 10+ years | Very low: no working prototypes | **Low** |

The assessment reveals a concentration of risk in two areas. Temporal structure and copyright law are both critical, but their nature differs: the former is a technical problem with a defined research path, while the latter depends on legislative and judicial processes beyond the research community's control. Embedding durability and cross-cultural bias are high-severity, low-attention problems, making them promising targets for novel research.

#### 8.5.3 Forecast: Corpus-Based Audio Generation in 2030–2035

By 2030, the hybrid paradigm—classical unit selection coupled with neural embedding retrieval and lightweight diffusion smoothing—will likely be the default architecture in research systems. Semantic navigation via natural language queries will be standard in sample library platforms, following Splice's CLAP-based search deployment [^26^]. Million-unit personal sound libraries, indexed by embedding, will be feasible on consumer hardware. Real-time concatenative pipelines will appear as stock devices in major DAWs, but adoption depends on whether copyright frameworks clarify the status of algorithmic recombination; if the RIAA litigation era produces a licensing mechanism, the commercial market could expand from one plugin to dozens. In game audio, corpus-driven procedural sound—where a small library generates infinite context-responsive variations—will enter mainstream middleware if memory and latency constraints are resolved. The temporal blind spot will not be fully closed, but beat-synchronized instruments will exist alongside dominant timbre-centric systems. By 2035, the field will have matured from a single paradigm to an ecosystem of hybrid architectures, each selecting the neural-classical balance appropriate to its latency, quality, and legal constraints.
