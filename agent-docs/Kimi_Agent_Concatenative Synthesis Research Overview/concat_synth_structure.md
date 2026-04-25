# Concatenative Synthesis: Principles, Practice, and the Neural Convergence

## Report Skeleton and Chapter Structure

This document defines the complete chapter hierarchy, word count allocations, required content elements, and writing dependencies for a deep technical report on concatenative synthesis. The structure integrates five narrative arcs identified through cross-dimensional research synthesis: the unbroken historical thread from 1948 to present; the speech-music divergence; the trajectory from descriptor crisis to embedding resolution; legal risk as the invisible architect of adoption; and the instrument revolution of the corpus-as-instrument paradigm.

**Total target length:** 14,500 words (range: 12,000–15,000 words)
**Heading convention:** Four levels only — H1 unnumbered for the report title; H2 numbered for chapters; H3 numbered for sections; H4 numbered for content points. No H5 headings are used anywhere in the report.

---

**Writing Workflow and Chapter Dependencies**

The report is organized into three serial tiers for production. Tier 1 chapters (Chapters 1, 2, and 7) can be drafted in parallel immediately — they require no prior chapter completion. Chapter 1 establishes terminology and scope; Chapter 2 builds the historical foundation; Chapter 7 surveys the commercial and legal landscape. Tier 2 chapters (Chapters 3 and 4) depend on Tier 1 completion: Chapter 3 requires Chapter 2 for historical context on descriptor evolution and the Hunt and Black framework; Chapter 4 requires Chapter 3 for algorithmic prerequisites. Tier 3 chapters (Chapters 5, 6, and 8) depend on all prior tiers: Chapter 5 extends Chapter 3's descriptor and selection material into neural embedding spaces; Chapter 6 draws on Chapters 2, 4, and 5 for creative practice context; Chapter 8 synthesizes findings from all preceding chapters. The recommended serial writing order is: 1, 2, 7 (parallel) → 3 → 4 → 5, 6 (parallel) → 8.

---

## 1. Introduction and Conceptual Framework

**Word count target:** 1,000 words

**Required elements:** (1) Comparative table: concatenative synthesis vs. granular synthesis vs. wavetable synthesis vs. sampling/ROMpler, with columns for corpus role, selection mechanism, transition method, and real-time capability. (2) Definition box or callout: formal statement of the concatenative synthesis problem as target specification + corpus + unit selection + concatenation.

**Depends on:** None. This chapter can be drafted first and establishes terminology used throughout.

**Prerequisites for:** All subsequent chapters.

### 1.1 Defining Concatenative Synthesis

#### 1.1.1 Corpus-Based Audio Generation as a Distinct Paradigm
#### 1.1.2 The Unit Selection Problem: Specification, Search, and Joining
#### 1.1.3 Scope and Terminology: What This Report Covers and Excludes

### 1.2 The Core Proposition: Identity Through Selection

#### 1.2.1 Why Concatenative Synthesis Produces Idiosyncratic Output
#### 1.2.2 Spectral, Temporal, and Semantic Dimensions of Control
#### 1.2.3 The Inversion of the Sample Library Paradigm

### 1.3 Report Structure and Reading Guide

#### 1.3.1 Chapter Dependencies and Recommended Reading Paths
#### 1.3.2 Notation, Mathematical Conventions, and Citation Style

---

## 2. Foundations and Historical Lineage

**Word count target:** 2,200 words

**Required elements:** (1) Chronological timeline table: 1948 (Schaeffer) through 2025 (Latent Granular Resynthesis, The Concatenator), with columns for year, development, institution/individual, and significance to concatenative synthesis. (2) Table of key systems and their characteristics: Fairlight CMI, TD-PSOLA, Festival/CHATR, CataRT, AudioGuide, CataRT-MuBu, Mosaïque, FluCoMa. (3) Case study: the IRCAM school from Caterpillar (2000) to CataRT (2006) and its formalization as a Digital Musical Instrument.

**Depends on:** None. This is a foundation chapter.

**Prerequisites for:** Chapters 3, 4, 5, 6, and 8.

### 2.1 Analog Precursors: Musique Concrete and Tape Splicing

#### 2.1.1 Schaeffer and the Groupe de Recherches Musicales at RTF Paris
#### 2.1.2 From Manual Splicing to Algorithmic Assembly: The Conceptual Unbroken Thread

### 2.2 Digital Foundations: Phase Vocoder and Short-Time Fourier Transform

#### 2.2.1 Flanagan and Golden: The Phase Vocoder (1966)
#### 2.2.2 Portnoff and Crochiere: STFT for Analysis-Resynthesis
#### 2.2.3 The Phase Vocoder as Transition Infrastructure for Concatenative Systems

### 2.3 Speech Synthesis Lineage and the Unit Selection Framework

#### 2.3.1 TD-PSOLA: Time-Domain Pitch-Synchronous Overlap-Add
#### 2.3.2 Hunt and Black (1996): The Canonical Target Cost and Concatenation Cost Formulation
#### 2.3.3 Festival, CHATR, and MBROLA: From Research to Deployment
#### 2.3.4 The Speech-Music Divergence: Why Neural TTS Replaced Concatenative Speech but Music Moved in Reverse

### 2.4 The IRCAM School and Corpus-Based Musical Synthesis

#### 2.4.1 Caterpillar and Early Corpus Experiments (2000)
#### 2.4.2 CataRT: Formalization of Corpus-Based Concatenative Synthesis (2006)
#### 2.4.3 From Research Prototype to Performance Practice: The Instrumental Turn

### 2.5 Adjacent Fields and Conceptual Boundaries

#### 2.5.1 Granular Synthesis: Overlap, Divergence, and the Boundary Ambiguity
#### 2.5.2 Audio Mosaicking and Sound Texture Synthesis
#### 2.5.3 Sampling, Wavetable Synthesis, and the ROMpler Boundary

---

## 3. The Algorithmic Core: Descriptors, Selection, and Search

**Word count target:** 2,800 words

**Required elements:** (1) Table of descriptor sets with columns for name (e.g., MPEG-7, Timbre Toolbox, CUIDADO), dimensionality, perceptual correlates, and computational cost. (2) Mathematical formulation: the Hunt and Black cost function with target cost (20–30 sub-costs) and concatenation cost (3 sub-costs: cepstral distance, log power difference, pitch difference). (3) Figure or structured description: comparison of search data structures — k-d tree, vantage point tree, locality-sensitive hashing, HNSW, and vector database — with columns for construction time, query time complexity, memory overhead, and scalability ceiling. (4) Case study: CataRT's 230-descriptor pipeline, Mahalanobis normalization, and PCA-based k-d tree acceleration.

**Depends on:** Chapter 2 (for Hunt and Black framework and historical descriptor evolution).

**Prerequisites for:** Chapters 4, 5, and 8.

### 3.1 Audio Feature Extraction and Descriptor Sets

#### 3.1.1 Classical Acoustic Descriptors: Spectral Centroid, Flux, Zero-Crossing Rate, Roloff
#### 3.1.2 MFCC and Cepstral Representations: From Speech to Music
#### 3.1.3 MPEG-7 and Standardized Descriptor Frameworks
#### 3.1.4 The Timbre Toolbox: Perceptually Grounded Descriptors (Peeters et al. 2011)
#### 3.1.5 The Perceptual-Mathematical Gap: Why Verbal Descriptors Map Poorly onto Mathematical Features

### 3.2 Feature Spaces and Distance Metrics

#### 3.2.1 Euclidean, Manhattan, and Cosine Distances in Timbre Space
#### 3.2.2 Mahalanobis Distance and Perceptual Weighting Normalization
#### 3.2.3 PCA, t-SNE, and UMAP for Dimensionality Reduction and Visualization
#### 3.2.4 Wessel and Grey (1975): The Discovery of Timbre Space Dimensionality

### 3.3 Unit Selection Algorithms

#### 3.3.1 Target Cost and Concatenation Cost: Formalizing the Joint Optimization
#### 3.3.2 Dynamic Programming and Pruned Viterbi Search (Beam Width 10–20)
#### 3.3.3 Constraint Satisfaction and Rule-Based Selection Strategies
#### 3.3.4 Probabilistic Methods: Bayesian Particle Filters and Stochastic Unit Selection

### 3.4 Search Data Structures for Large Corpora

#### 3.4.1 K-D Trees and Vantage Point Trees: Exact Search with Logarithmic Complexity
#### 3.4.2 Approximate Nearest Neighbor: Locality-Sensitive Hashing and HNSW Graphs
#### 3.4.3 Vector Databases and Million-Scale Corpus Search: Pinecone, Milvus, FAISS
#### 3.4.4 The Concatenator's O(Pp) Complexity: Independence from Corpus Size

### 3.5 Transition Handling and Concatenation Artifacts

#### 3.5.1 Crossfade Strategies: Window Functions, Overlap Length, and Trade-Offs
#### 3.5.2 Phase Vocoder-Based Transition Smoothing and Spectral Continuity
#### 3.5.3 Perceptual Continuity Metrics: Spectral Distortion, Naturalness Scores, and Listening Tests

---

## 4. Real-Time Systems and Software Architectures

**Word count target:** 2,000 words

**Required elements:** (1) Table of tools with columns for name (CataRT, Mosaïque, FluCoMa, AudioGuide, Concatenator, Catecophony, SKataRT, OM-Diph), platform (Max/MSP, Max for Live, Python, SuperCollider, VST/AU/AAX, web), latency characteristics, maximum practical corpus size, maintenance status, and licensing. (2) System architecture description: audio callback thread, search/query thread, and UI thread with buffer management and thread-safety considerations. (3) Case study: a live performance setup using CataRT or Mosaïque, including gestural control, corpus loading, and real-time descriptor navigation.

**Depends on:** Chapter 3 (for algorithmic prerequisites on search and selection).

**Prerequisites for:** Chapters 5, 6, 7, and 8.

### 4.1 Latency, Throughput, and Real-Time Constraints

#### 4.1.1 Defining Real-Time: Latency Thresholds for Interactive Musical Performance
#### 4.1.2 CPU Load and Memory Management in Corpus-Based Systems
#### 4.1.3 Threading Models and Audio Callback Safety: Lock-Free Queues and Buffer Preloading

### 4.2 Interactive Concatenative Synthesis Environments

#### 4.2.1 CataRT and the Max/MSP Ecosystem: MuBu, FTM, and Descriptor Integration
#### 4.2.2 Mosaïque: Performance-Oriented Design in Max for Live
#### 4.2.3 FluCoMa: Algorithmic Frameworks for Creative Coding and Machine Listening
#### 4.2.4 AudioGuide: Offline Power, Python Flexibility, and Batch Composition Workflows

### 4.3 Emerging Tools and Research Prototypes

#### 4.3.1 The Concatenator (Tralie and Cantil, ISMIR 2024): Bayesian Particle Filtering for Real-Time Audio Mosaicking
#### 4.3.2 Catecophony and Web-Audio-Based Concatenative Frontiers
#### 4.3.3 SKataRT, Somax2, and IRCAM Forum Subscription Tools
#### 4.3.4 OM-Diph and OpenMusic Integration for Algorithmic Composition

### 4.4 Cross-Platform and Deployment Considerations

#### 4.4.1 Desktop Integration: VST/AU/AAX, Standalone, and Host Environments
#### 4.4.2 Embedded DSP and Hardware Constraints: Why No Hardware Instrument Implements Descriptor-Driven Concatenative Synthesis
#### 4.4.3 Web Audio and Browser-Based Architectures: WebAssembly and Streaming Corpora

---

## 5. The Neural Convergence: Deep Embeddings and Hybrid Architectures

**Word count target:** 2,500 words

**Required elements:** (1) Table of deep audio embedding models with columns for model name (CLAP, MuQ-MuLan, MERT, CLaMP 3, Jukebox, OpenL3), dimensionality, training data scale, perceptual agreement score on relevant benchmark, and computational cost of inference. (2) Figure or structured description: hybrid architecture diagram showing classical unit selection pipeline augmented with neural components at feature extraction, search, and transition stages. (3) Case study: CoSaRef pipeline (Take and Akama 2024/2025) — concatenative unit selection followed by diffusion-based refinement, with latency and quality analysis. (4) Mathematical note: the contrastive learning objective and its geometric interpretation in embedding space.

**Depends on:** Chapter 3 (for classical descriptor, distance, and selection foundations) and Chapter 4 (for real-time system constraints that hybrid architectures must respect).

**Prerequisites for:** Chapters 6, 7, and 8.

### 5.1 Deep Audio Embeddings as Semantic Descriptors

#### 5.1.1 CLAP: Contrastive Language-Audio Pretraining and the 71.9 Percent Perceptual Agreement Milestone
#### 5.1.2 MuQ and MuLan: Music-Specific Embedding Spaces and the 90.4 Percent Instrument-Wise Agreement Result
#### 5.1.3 MERT and Self-Supervised Audio Representations: SOTA with 7 Percent of Jukebox Parameter Count
#### 5.1.4 Embedding Comparison: When to Use CLAP vs. MuQ vs. MERT vs. Classical Descriptors

### 5.2 Neural-Augmented Unit Selection

#### 5.2.1 DNN-Guided Target Cost Functions (Merritt et al. 2016)
#### 5.2.2 kNN-SVC: Neural Vocoders with Corpus-Driven Selection (Shao et al. 2025)
#### 5.2.3 Embedding-Driven Nearest Neighbor in Vector Databases: Audiobrain and Producer Workflows
#### 5.2.4 From 512-Dimensional Vectors to Musical Control: The CLAP Latent Space as a Playable Interface

### 5.3 Generative Neural Methods for Transition Smoothing

#### 5.3.1 CoSaRef: Concatenative Reference with Diffusion Refinement
#### 5.3.2 AFTER: Diffusion-Based Audio Inpainting for Seamless Transitions
#### 5.3.3 RAVE: Real-Time Variational Autoencoding for Corpus Navigation and Resynthesis
#### 5.3.4 Latency Trade-Offs: RAVE Below 10ms vs. AFTER at 200–500ms

### 5.4 Neural Audio Codecs and Corpus Compression

#### 5.4.1 SoundStream and EnCodec: Learned Discrete Representations for Storage and Streaming
#### 5.4.2 Neural Codec Embeddings as Search Features: Compression Without Loss of Semantic Structure
#### 5.4.3 Latent Granular Resynthesis and Differentiable Concatenative Synthesis

### 5.5 The Convergent Architecture: Classical Selection, Neural Smoothing

#### 5.5.1 Hybrid Pipeline Design Patterns: Where Neural Components Replace vs. Augment Classical Stages
#### 5.5.2 Quality, Controllability, and Computational Cost: A Three-Way Trade-Off Analysis
#### 5.5.3 SelectTTS and the Speech-Music Divergence Revisited: Why Concatenative Hybrids Persist in Music

---

## 6. Creative Practice and the Corpus-as-Instrument

**Word count target:** 1,500 words

**Required elements:** (1) Case study: a specific documented artwork or performance that prominently uses concatenative synthesis (e.g., a CataRT-based improvisation, a FluCoMa commission, or a Mosaïque live set), with description of the corpus, control interface, and compositional strategy. (2) Table mapping creative techniques to their descriptor or control inputs: e.g., "timbre space exploration" to XY pad controlling spectral centroid and noisiness; "live corpus building" to on-the-fly analysis and descriptor computation. (3) Figure or conceptual description: the corpus topology as a navigable space — dimensionality reduction plot or interaction metaphor showing how performers move through descriptor space.

**Depends on:** Chapter 2 (for the instrumental turn and IRCAM history), Chapter 4 (for live system descriptions), and Chapter 5 (for neural embedding-driven creative possibilities).

**Prerequisites for:** Chapter 8.

### 6.1 The Ontological Shift: From Sample Library to Playable Topology

#### 6.1.1 CataRT as Digital Musical Instrument: Formalization and NIME 2012 Analysis
#### 6.1.2 Navigational Knowledge and the Transfer of Virtuosity from Physical Technique to Corpus Topology
#### 6.1.3 Cross-Corpus Selection and Timbre Space Exploration as Compositional Strategies

### 6.2 Composition by Navigation

#### 6.2.1 Descriptor-Guided Improvisation and Gestural Control
#### 6.2.2 Algorithmic Composition and Factor Oracle Approaches (MACAT)
#### 6.2.3 Live Corpus Building and On-the-Fly Analysis During Performance

### 6.3 Temporal Structure and the Rhythmic Blind Spot

#### 6.3.1 Timbre-Centric Design and the Systematic Undervaluation of Metric Structure
#### 6.3.2 Beat-Synchronized Unit Selection: Technical Challenges and Partial Solutions
#### 6.3.3 MACAT and Sequence-Aware Concatenative Systems: The Factor Oracle Direction

### 6.4 Artist Case Studies and Performance Contexts

#### 6.4.1 IRCAM, BEAST, and Institutional Practice in Electroacoustic Music
#### 6.4.2 Electronic Music and Sound Art Communities: From Experimental to Mainstream Adjacency
#### 6.4.3 Interdisciplinary and Installation Applications: Non-Performance Contexts

---

## 7. Markets, Law, and the Adoption Paradox

**Word count target:** 1,300 words

**Required elements:** (1) Table of all known concatenative synthesis tools (commercial, open-source, research prototype) with status (active/maintained/abandoned), pricing, platform, and last update date. (2) Timeline of legal cases affecting sampling and corpus-based audio generation: Grand Upright (1991), Bridgeport (2005), RIAA v. Suno/Udio (2024), Thomson Reuters v. Ross Intelligence (2025), GEMA v. OpenAI (2025). (3) Case study: the Datamind Audio Concatenator commercial launch (2025, $149) and its positioning as the sole commercial plugin in a mature DSP field.

**Depends on:** Chapter 4 (for tool descriptions and technical capabilities that contextualize market assessment).

**Prerequisites for:** Chapter 8.

### 7.1 The Commercial Landscape: A Near-Empty Market

#### 7.1.1 The Single Commercial Plugin: Datamind Audio Concatenator (2025)
#### 7.1.2 Open-Source Ecosystem: Maintenance, Abandonment, and Gaps in Active Development
#### 7.1.3 Granular Synthesis as the De Facto Commercial Alternative: Portal, Pigments, Falcon, Omnisphere
#### 7.1.4 Game Audio Middleware: A $1.47 Billion Market with Zero Corpus-Based Concatenative Implementation

### 7.2 Copyright Law and the Clearance Culture

#### 7.2.1 Grand Upright v. Warner Bros. (1991): The Sampling Precedent
#### 7.2.2 Bridgeport v. Dimension Films (2005): The Bright-Line Rule
#### 7.2.3 The AI Litigation Era: RIAA v. Suno/Udio (2024) and the Expansion of Liability
#### 7.2.4 Thomson Reuters v. Ross Intelligence (2025) and GEMA v. OpenAI (2025): Training Data and Reproduction

### 7.3 Pathways Forward: Attribution, Licensing, and Open Corpora

#### 7.3.1 FreeSound and the Creative Commons Ecosystem: 670,000 Sounds and 94.2 Million Downloads
#### 7.3.2 Barnett et al.: Informed Creation and Training Data Attribution for VampNet
#### 7.3.3 The EU AI Act (March 2024) and Emerging Regulatory Frameworks for Corpus-Driven AI
#### 7.3.4 Why Concatenative Synthesis Faces a Unique Legal Barrier That FM, Wavetable, and Physical Modeling Do Not

---

## 8. Open Problems and Future Directions

**Word count target:** 1,200 words

**Required elements:** (1) Table of open problems with columns for problem domain (temporal, scalability, cultural, hardware, methodological), severity (fundamental/limiting/speculative), current research readiness (active nascent/theoretical only), and potential impact on the field. (2) Forecast paragraph: a grounded projection of the corpus-based audio generation landscape in 5–10 years, synthesizing convergent architecture trends, legal evolution, and embedding technology trajectories.

**Depends on:** All preceding chapters. This is the synthetic conclusion.

**Prerequisites for:** None. This is the terminal chapter.

### 8.1 The Temporal Blind Spot: Rhythm, Meter, and Structure

#### 8.1.1 The Systematic Timbre-Centrism of Concatenative Descriptor Sets
#### 8.1.2 Toward Metrically Aware Unit Selection: Beat-Synchronized Matching and Metric Quantization
#### 8.1.3 Sequence Learning and Structured Concatenative Output Beyond Timbre Space

### 8.2 Scalability and Corpus Architecture

#### 8.2.1 From Megabytes to Terabytes: Distributed Corpus Systems and Shard-Based Search
#### 8.2.2 Embedding Durability and Versioning: Will CLAP 2023 Embeddings Remain Valid?
#### 8.2.3 Corpus Drift and Backward Compatibility for Producer Workflows

### 8.3 Cross-Cultural and Non-Western Applications

#### 8.3.1 Bias in Descriptor Sets and Embedding Training Data: The Western-Centric Timbre Vocabulary
#### 8.3.2 Opportunities for Diverse Musical Traditions, Tunings, and Timbral Practices

### 8.4 Hardware, Edge Computing, and New Form Factors

#### 8.4.1 Embedded DSP and Real-Time Corpus Matching on Constrained Devices
#### 8.4.2 Neuromorphic and Quantum Computing for Audio Search: Separating Speculation from Feasibility

### 8.5 Toward a Convergent Future

#### 8.5.1 The Hybrid Synthesis Paradigm as the Default Architecture
#### 8.5.2 Research Gaps and Publication Opportunities for New Contributors
#### 8.5.3 A Forecast: Corpus-Based Audio Generation in 2030–2035

---

**Structure Rationale and Design Decisions**

**Narrative arc integration.** The eight chapters map directly onto the five narrative arcs identified in the research synthesis. Chapter 2 carries Arc 1 (The Unbroken Thread) from Schaeffer through CataRT to the present. Chapters 2 and 5 jointly carry Arc 2 (The Speech-Music Divergence), with Chapter 2 establishing the speech lineage and Chapter 5 resolving the divergence through hybrid architectures. Chapters 3 and 5 carry Arc 3 (From Descriptor Crisis to Embedding Resolution), with the classical descriptor material in Chapter 3 providing the problem statement and Chapter 5 providing the neural solution. Chapters 4 and 7 carry Arc 4 (Legal Risk as Invisible Architect), with Chapter 4 documenting mature tools and Chapter 7 explaining why commercial adoption has not followed. Chapters 4 and 6 carry Arc 5 (The Instrument Revolution), with Chapter 4 describing the systems and Chapter 6 describing the practice.

**Word count philosophy.** The distribution follows an inverted-U pattern: foundational and framing chapters (1 and 2) are moderately weighted; the technical core (Chapter 3) and the neural frontier (Chapter 5) receive the highest allocations because they are where the report delivers its primary value beyond a literature review; applied and contextual chapters (4, 6, 7, 8) taper toward the end. This reflects the report's purpose as a technically deep document for developers and researchers — the algorithmic and neural material must be substantially developed, while market and creative coverage provides necessary context without dominating.

**Technical depth calibration.** Chapter 3 includes formal mathematical formulations of the Hunt and Black cost function because this is the canonical framework that every subsequent chapter references implicitly or explicitly. Chapter 5 includes a mathematical note on contrastive learning objectives because embedding geometry is the conceptual bridge between classical distance metrics and neural retrieval. Other chapters present algorithmic ideas in prose with structured descriptions rather than equations, maintaining accessibility for the musician segment of the audience without sacrificing precision for the developer and researcher segments.

**Audience-aligned progression.** The reading path assumes familiarity with DSP and machine learning concepts but not with concatenative synthesis specifically. Chapter 1 defines scope and distinguishes the paradigm from adjacent methods. Chapter 2 provides historical context that motivates why the field developed as it did. Chapter 3 is the densest technical chapter and is placed after the reader has absorbed motivation and history. Chapter 4 grounds the algorithms in real systems. Chapter 5 extends into the active frontier where researchers are currently publishing. Chapters 6 and 7 provide creative and commercial context. Chapter 8 synthesizes and projects forward. A developer seeking implementation guidance can focus on Chapters 3, 4, and 5; a researcher seeking open problems can focus on Chapters 5 and 8; a musician seeking creative entry points can focus on Chapters 2, 4, and 6.

**Dependency minimization for parallel writing.** The structure maximizes parallel drafting opportunities. Three chapters (1, 2, 7) are independent. Two chapters (5 and 6) can proceed in parallel once the algorithmic core (Chapter 3) is complete. Only the final synthesis chapter (8) requires all prior material. This design supports efficient collaborative production without sacrificing logical flow in the final document.
