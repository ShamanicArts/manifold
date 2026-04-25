# Content Plan: Concatenative Synthesis Deep Research Report

## Document Parameters
- **Target Length**: 12,000-15,000 words
- **Chapter Count**: 9 chapters
- **Target per Chapter**: 1,300-1,800 words
- **Heading Levels**: H2 (chapters), H3 (sections), H4 (specific content points)
- **Citation Style**: Formal academic citations; primary sources from dimension files

---

## Chapter 1: Foundations and Historical Lineage
**Word Target**: 1,500-1,800 | **Primary Dimensions**: Dim 01, Dim 06, parts of Dim 02, Dim 11
**Narrative Arc**: Arc 1 (The Unbroken Thread, 1948 to Present)
**Placement**: Opening chapter — establishes chronological and conceptual baseline

### 1.1 Origins: Musique Concrète and the Analog Concatenative Paradigm

#### Define Schaeffer's 1948 "Concert de bruits" and the philosophical reversal of compositional practice
- Content point: Explain Schaeffer's explicit rejection of 12-tone abstraction in favor of working directly with "concrete" sound material; quote his statement about "abstracting the musical values" from recorded sound
- Data: October 5, 1948 broadcast date; "Étude aux chemins de fer" and four other noise studies
- Sources: Britannica / ISM Research Starters; For the Love of Noise (2021)
- Table: Chronology of Schaeffer-Henry-Poullin inventions (morphophone, phonogene, three-track recorder, 1951)

#### Trace Xenakis's granular theory from Gabor's 1947 "acoustical quanta" through Analogique A-B (1959)
- Content point: Document how Xenakis used manual tape splicing of thousands of grains according to stochastic scores, with Bernard Parmegiani as musical assistant
- Data: Gabor 1947 Theory of Communication; Xenakis 1959 Analogique A-B using analog tone generators; 1960 theoretical formulation
- Sources: Xenakis organization website; Roads Microsound; SFU Truax granular synthesis page
- Figure: Diagram comparing Gabor's quantum analogy to modern time-frequency analysis

#### Establish the conceptual continuity between tape splicing and digital unit selection
- Content point: Argue that the core proposition of concatenative synthesis — assembling new sounds from existing recordings by intelligent selection and joining — has remained constant across the analog-to-digital transition
- Data: The same "unit" concept appears in Schaeffer's "sound object" (1966 Traité des Objets Musicaux) and Schwarz's digital unit definitions
- Sources: Schwarz JNMR 2006 "Concatenative Sound Synthesis: The Early Years"; Dim 01, Dim 06

### 1.2 The Digital Transition: Sampling, Phase Vocoder, and STFT Foundations

#### Document the Fairlight CMI (1979) as the first digital concatenative instrument
- Content point: Explain how Ryrie and Vogel pivoted from digital synthesis to digital recording of natural sounds; describe Page R sequencer (1982) as first graphic pattern-based sequencer for sample arrangement
- Data: Fairlight CMI price range £12,000-£60,000; E-mu Emulator (1981), Emulator II (1984), Ensoniq Mirage ($1,695, 1984), Akai S-series (1985+)
- Sources: Out of Phase Fairlight history; Wikipedia Fairlight CMI
- Table: Timeline of sampler democratization (1981-1987)

#### Map the phase vocoder analysis/synthesis pipeline as the DSP substrate for all modern concatenative systems
- Content point: Trace Flanagan & Golden (1966 Bell Labs) through Portnoff FFT implementation (1976), Crochiere WOLA (1980), Griffin-Lim (1984), Dolson tutorial (1986), Laroche & Dolson phase-locking (1999)
- Data: Phase vocoder represented speech by short-time phase and amplitude spectra; WOLA condition that analysis/synthesis windows must overlap-add to a constant
- Sources: Flanagan & Golden 1966 BSTJ; Portnoff 1976 IEEE Trans ASSP; Crochiere 1980; Griffin & Lim 1984; Dolson 1986 CMJ; Laroche & Dolson 1999
- Figure: Block diagram of STFT analysis/synthesis pipeline used in concatenative systems

### 1.3 Speech Synthesis Foundations: TD-PSOLA and the Hunt & Black Framework

#### Explain Moulines & Charpentier's TD-PSOLA (1990) as pitch-synchronous concatenation for speech
- Content point: Describe how TD-PSOLA isolates pitch periods, performs modifications, and resynthesizes through overlap-add; note its low computational demands making it ideal for real-time use
- Data: TD-PSOLA uses Hanning windows extending two pitch periods; default 10ms window for unvoiced segments
- Sources: Moulines & Charpentier 1990 Speech Communication; Texas A&M / UIUC lecture notes
- Connection: Links to Chapter 8 (Speech Synthesis Cross-Domain)

#### Present Hunt & Black (1996 ICASSP) as the algorithmic Big Bang of modern concatenative synthesis
- Content point: Detail the dual-cost framework — target cost (20-30 sub-costs) and concatenation cost (3 sub-costs: cepstral distance, log power difference, pitch difference); explain Viterbi search with beam width 10-20 achieving near real-time on 100,000-unit database
- Data: p varies between 20 and 30 for target cost; q=3 for concatenation cost; pruned Viterbi with beam width 10-20
- Sources: Hunt & Black ICASSP 1996; Aalto University Speech Processing Book
- Table: Comparison of Hunt & Black framework vs. earlier diphone synthesis

### 1.4 The IRCAM School: From Caterpillar to CataRT

#### Document Diemo Schwarz's trajectory from Caterpillar (2000, offline Viterbi) to CataRT (2006, real-time greedy)
- Content point: Explain the critical architectural shift: Caterpillar used globally optimal Viterbi path-search; CataRT abandoned this for real-time nearest-neighbor selection to enable interactive performance
- Data: Caterpillar at COST-G6 2000; PhD thesis 2004 (Paris 6); CataRT DAFx 2006; IEEE SPM 2007 survey
- Sources: Schwarz DAFx-06; Schwarz JNMR 2006; Schwarz IEEE SPM 2007; NIME 2012
- Figure: Architectural comparison diagram (Caterpillar vs. CataRT selection algorithms)

#### Position granular synthesis as the technical precursor that concatenative synthesis extends
- Content point: Quote Schwarz's canonical statement: "Granular synthesis is rudimentarily corpus-based... the only control is position in one single sound file"; explain how CataRT adds content-based selection, descriptor analysis, and multi-file corpus navigation
- Data: Grain sizes: granular 1-50ms vs. concatenative 100ms to several seconds
- Sources: Schwarz JIM 2008; Schwarz DAFx-06; Dim 06 granular synthesis dimension
- Connection: Links to Chapter 3 (Real-Time Systems, where CataRT's granular engine is detailed) and Chapter 5 (Commercial Landscape, where granular plugin market is contrasted)

---

## Chapter 2: The Algorithmic Core: Descriptors, Selection, and Search
**Word Target**: 1,600-1,900 | **Primary Dimensions**: Dim 02, Dim 03
**Narrative Arc**: Arc 3 (From Descriptor Crisis to Embedding Resolution); partial Arc 5
**Placement**: After Foundations

### 2.1 Feature Extraction: From Handcrafted Descriptors to Embedding Spaces

#### Catalog the low-level descriptor families used in concatenative synthesis
- Content point: Systematically present spectral descriptors (centroid, rolloff, flux, flatness), temporal descriptors (ZCR, RMS energy, temporal centroid), cepstral descriptors (MFCC), and perceptual descriptors (pitch, loudness, brilliance, noisiness, roughness, inharmonicity, sharpness)
- Data: CataRT imports 230 descriptors; MFCC extracted with FFT window 1024 samples, hop 512; 13 MFCC coefficients standard
- Sources: Bee Suan Ong ICMC 2005; Caetano et al. "Audio Content Descriptors of Timbre"; tiNNbre paper
- Table: Descriptor taxonomy with concatenative synthesis relevance ratings

#### Document the MPEG-7 standardization effort and its adoption in concatenative systems
- Content point: Explain how Caterpillar and CataRT built upon MPEG-7 low-level descriptors; describe SDIF as the interchange format (jointly defined by IRCAM, CNMAT, UPF, 1996-97)
- Data: SDIF extensions for audio features (ISMIR 2008); Burred, Cella, Peeters, Robel, Schwarz paper
- Sources: Caetano et al. chapter; Matt Wright SDIF handout; ISMIR 2008 SDIF extensions paper
- Figure: Diagram showing descriptor extraction pipeline from raw audio through SDIF to CataRT's (N,D) matrix

#### Trace the perceptual-mathematical gap from Wessel/Grey timbre space through McAdams et al. to Timbre Toolbox
- Content point: Present Grey's 1975 MDS studies establishing attack time, centroid, and spectral flux as canonical timbre dimensions; McAdams et al. 1995 correlation data (r=.94 for rise time, r=.94 for spectral centroid, r=.85 for spectral irregularity); Peeters' Timbre Toolbox (2011) and the persistent mapping problem
- Data: Three canonical timbre dimensions with acoustic correlates; non-linear models needed per McAdams 2019
- Sources: MUTOR Wessel/Grey; McAdams et al. 1995; Peeters et al. 2011 JASA
- Connection: Sets up Chapter 4's discussion of CLAP embeddings resolving this 20-year gap

### 2.2 Unit Selection Algorithms: From Viterbi to Real-Time Matching

#### Detail the Hunt & Black dual-cost framework and its musical adaptations
- Content point: Explain target cost as weighted sum of feature vector differences; concatenation cost as join-point continuity; zero-cost condition for consecutive units encouraging non-uniform selection; weight training via regression (100x faster than weight space search)
- Data: Target cost p=20-30 sub-costs; concatenation cost q=3 sub-costs; beam width 10-20 for near real-time on 100,000-unit database
- Sources: Hunt & Black 1996; Schwarz PhD thesis 2004; Aalto Speech Processing Book
- Table: Cost function components and their perceptual motivations

#### Present Schwarz's Caterpillar Viterbi path-search as the first musical adaptation
- Content point: Describe Caterpillar's weighted Euclidean distance normalized by standard deviation; constraint satisfaction formulation as alternative to Viterbi; comparison of the two approaches in Schwarz's thesis
- Data: Caterpillar uses MPEG-7 descriptors plus score-derived and class descriptors; unit descriptors condensed by modeling temporal evolution (mean, slope, spectrum)
- Sources: Schwarz DAFx 2000; Schwarz PhD thesis 2004
- Connection: Links to Chapter 3 (where CataRT's real-time compromise is detailed)

#### Explain CataRT's real-time nearest-neighbor selection with Mahalanobis distance
- Content point: Present the exact formula d = (x-μ)²/σ where μ is the (N,D) unit matrix and σ is the per-descriptor standard deviation; describe the radius-based selection (minimal d or random from d < r² set); explain the PCA-based kd-tree acceleration
- Data: kd-tree splits along hyperplane perpendicular to principal component vector; each step eliminates approximately half the units
- Sources: Schwarz et al. DAFx 2006; Schwarz JIM 2008; Schwarz ICMC 2009
- Figure: Visual diagram of 2D descriptor space projection with target point, selection radius, and nearest-neighbor selection

### 2.3 Search Structures and Scalability

#### Catalog efficient search structures for large corpora
- Content point: Compare kd-trees (CataRT), PCA branch-and-bound (Schwarz), filter-and-refine methods (Schnitzer et al. ISMIR 2009 — 10-30x speedup, 95-99% recall), vector databases (FAISS, Pinecone for million-scale corpora)
- Data: Schnitzer et al. accelerated Kullback-Leibler divergence search by factor of 10-30 with 95-99% recall; Barnett et al. stored 5 million embeddings in Pinecone
- Sources: Schwarz DAFx 2006; Schnitzer et al. ISMIR 2009; Barnett et al. 2024
- Table: Search structure comparison (corpus size, query time, recall, dimensionality)

#### Present distance mapping and warping functions for musical constraints
- Content point: Explain Schwarz's SMC 2011 distance mapping — integrating additional criteria (avoiding repetition, favoring specific corpora) while preserving kd-tree efficiency; describe functional formulation enabling interpolation between solution spaces
- Data: Distance mapping achieves constraint integration "with only little loss of efficiency"
- Sources: Schwarz SMC 2011; Schwarz ICMC 2009 (mass-spring model for layout)
- Connection: Links to Chapter 7 (Creative Practice, where solution spaces are discussed)

---

## Chapter 3: Real-Time Systems and Software Architectures
**Word Target**: 1,400-1,700 | **Primary Dimensions**: Dim 04, parts of Dim 05, Dim 08
**Narrative Arc**: Arc 5 (The Instrument Revolution); partial Arc 4
**Placement**: After Algorithmic Core

### 3.1 The CataRT Ecosystem: Architecture and Data Flow

#### Detail CataRT's Model-View-Controller architecture
- Content point: Present the three-stage workflow: analysis (segmentation + descriptors), representation ((N,D) matrix, SQLite database, 2D/3D projection), synthesis (nearest-neighbor search, transformation, concatenation); explain FTM data structures, Gabor's event-based grain processing, MnM statistical operations
- Data: Gabor processes "atomic sound particles" at arbitrary rates via Max message processing rather than block-wise MSP streaming; FTM `fmat` class for sample vectors and spectra
- Sources: Schwarz DAFx 2006 (expanded); Schnell & Schwarz DAFx 2005
- Figure: Data flow diagram showing audio input → analysis → descriptor matrix → selection → synthesis

#### Document CataRT-MuBu as the modern successor
- Content point: Explain MuBu as generic multimodal container (audio, descriptors, motion, MIDI, markers); PiPo for descriptor computation; CataRT-MuBu supersedes FTM-based "classic" CataRT; reached release 1.7.0 by September 2025
- Data: Requires Max 7+; distributed via Max Package Manager and IRCAM Forum; license "Forum (Toolbox distributed freely, proprietary code)"
- Sources: GitHub ircam-ismm/catart-mubu; IRCAM Forum discussion 2025
- Connection: Links to Chapter 7 (Creative Practice, where bach-CataRT integration is discussed)

#### Present live corpus building as a distinctive improvisation feature
- Content point: Describe how real-time audio input is segmented and analyzed on-the-fly, creating a corpus from "the last several minutes of whose playing"; explain the "shared symbolic instrument" concept between acoustic and digital performers
- Data: First demonstrated at LAM conference 2006 with improvisers George Lewis and Evan Parker
- Sources: Schwarz DAFx 2006; Dim 08 live performance dimension
- Connection: Links to Chapter 7 (Live Performance, where this is the central interaction paradigm)

### 3.2 The Expanded Ecosystem: FluCoMa, Mosaïque, and New Tools

#### Present FluCoMa as the de facto standard infrastructure
- Content point: Document FluCoMa's scope: audio decomposition, ML (KDTree, UMAP, PCA, MLP), buffer utilities; active in Max, SuperCollider, Pure Data; powers Mosaïque, ReaCoMa for REAPER; funded by EU Horizon 2020 (grant 725899), now supported by Conservatorio della Svizzera italiana
- Data: Public release 1.0.0 May 2020; ~5 years development; led by Tremblay, Green, Roma, Bradbury, Moore
- Sources: FluCoMa website; CCRMA Stanford workshop; Phaidra dissertation
- Table: FluCoMa objects relevant to concatenative synthesis (KDTree, @blocking 2 "Rod mode")

#### Document Mosaïque as democratization for non-coders
- Content point: Describe 3D corpus visualization environment; MIDI, OSC, and algorithmic navigation tools; built on FluCoMa; free Max for Live device; version 0.2 on Zenodo August 2025; funded by FRQSC and OICRM
- Data: Requires Ableton Live 11/12 and Max 8.6.0+; "Downloads: 1" on maxforlive.com (newly added)
- Sources: AIMC 2024 workshop; GitHub LFO-lab/Mosaique; maxforlive.com
- Connection: Contrasts with Chapter 5's discussion of Concatenator as commercial alternative

#### Present the 2024-2025 "Concatenative Renaissance"
- Content point: List Concatenator (DataMind Audio, ISMIR 2024, $149 VST/AU/AAX), Catecophony (VST3/AU, Ben Hayes), SKataRT (IRCAM Forum subscription, ~200 EUR/year), AudioGuide (Python, offline, open-source), dada library (Max, symbolic corpus modules)
- Data: Concatenator: computational complexity O(Pp), independent of corpus size; CataRT-MuBu 1.7.0 September 2025
- Sources: Sound on Sound 2025; Tralie & Cantil ISMIR 2024; IRCAM Forum; VI-Control forums
- Table: Tool comparison matrix (platform, real-time, price, corpus size limit, descriptor types)

### 3.3 Engineering Real-Time Performance

#### Analyze the real-time quality trade-off
- Content point: Contrast CataRT's greedy nearest-neighbor (sacrifices global optimality for interactivity) with Caterpillar's Viterbi global optimization; present The Concatenator's Bayesian particle filter as a breakthrough achieving corpus-size-independent complexity
- Data: The Concatenator maintains P particles, each representing p corpus windows; transition model controls time-continuity; scales to corpora hours long
- Sources: Schwarz DAFx 2006; Tralie & Cantil ISMIR 2024
- Connection: Links to Chapter 4 (Neural Convergence, where AFTER adds 200-500ms latency for diffusion refinement)

#### Present buffer management and latency engineering considerations
- Content point: Discuss RAM vs. disk streaming trade-offs; multi-threading for analysis and synthesis; thread safety in shared corpus access; latency compensation strategies
- Data: CataRT's centralized write access (`catart.data`) and distributed read access (`catart.data.proxy`)
- Sources: Dim 04 real-time systems dimension; CataRT documentation
- Connection: Links to Chapter 9 (Future Directions, where WebAssembly and embedded deployment are discussed)

---

## Chapter 4: The Neural Convergence: Embeddings and Deep Learning Hybrids
**Word Target**: 1,700-2,000 | **Primary Dimensions**: Dim 09, Dim 10
**Narrative Arc**: Arc 2 (Speech-Music Divergence); Arc 3 (Embedding Resolution); Arc 5 (Neural-Enhanced Convergence)
**Placement**: Middle — benefits from prior technical context, sets up later chapters

### 4.1 Deep Audio Embeddings: Resolving the Perceptual-Mathematical Gap

#### Present CLAP as the de facto cross-modal audio embedding standard
- Content point: Explain HTSAT audio encoder + RoBERTa text encoder; symmetric InfoNCE loss; 512-dimensional latent space; zero-shot music retrieval without task-specific training
- Data: CLAP achieves 71.9% human perceptual agreement on Inst-Sim-ABX full mixes; Human-CLAP fine-tuning increases SRCC to 0.506 vs. 0.259 baseline (nearly 2x improvement)
- Sources: Wu et al. ICASSP 2023; Vohra et al. January 2026; Takano et al. January 2026
- Table: Embedding model comparison (CLAP, MuQ-MuLan, MERT, CLaMP 3) with dimensions, training data, and key benchmarks

#### Document MuQ-MuLan and MERT as specialized music embeddings
- Content point: MuQ uses Mel Residual Vector Quantization for SSL; achieves ROC-AUC 79.3 on MagnaTagATune; instrument-wise weighted similarity reaches 90.4% perceptual agreement; MERT achieves SOTA on MARBLE with only 7% of Jukebox's parameters (330M vs. ~5B)
- Data: MuQ trained on 0.9K hours open-source data; MERT on 160K hours; CLaMP 3 aligns sheet music, MIDI, audio, and multilingual text (25 retrieval combinations)
- Sources: Zhu et al. January 2025; Li et al. June 2023; Wu et al. February 2025
- Connection: Links to Chapter 2 (where handcrafted descriptors are catalogued as the pre-embedding baseline)

#### Present vector databases and production-scale embedding workflows
- Content point: Describe Audiobrain (Mac app, local CLAP inference via Apple Silicon MPS/CPU, 30-120 seconds per track, exports 512-dim L2-normalized vectors); Barnett et al.'s 5 million embeddings in Pinecone for VampNet training data attribution
- Data: Processing time 30-120 seconds per track; slice-and-pool strategy (3x 7-second windows at 10%, 45%, 80% of track)
- Sources: TheMusicCase Blog March 2026; Barnett et al. January 2024
- Figure: Workflow diagram: audio file → CLAP inference → vector export → Qdrant/Pinecone/FAISS → semantic query

### 4.2 Neural-DSP Hybrid Architectures

#### Present CoSaRef as the canonical concatenative + diffusion hybrid
- Content point: Explain the two-stage pipeline: concatenative sampler generates synthetic audio from MIDI using NSynth note samples, then SAOpen latent diffusion model refines via SDEdit/ZETA zero-shot editing; requires no MIDI-audio paired training data
- Data: CoSaRef outperformed state-of-the-art MIDI-supervised timbre-controllable method in both objective and subjective evaluation; Sony CSL Tokyo, Take & Akama 2024
- Sources: Take et al. arXiv 2410.16785; ISMIR 2024
- Connection: Links to Chapter 8 (Speech Synthesis, where hybrid TTS approaches are discussed)

#### Document RAVE and AFTER as real-time neural audio synthesis with corpus-derived timbre
- Content point: RAVE generates 48kHz audio 20x faster than real-time on standard laptop CPU; latency below 10ms; causal reconfiguration for real-time; AFTER adds conditional latent diffusion on RAVE latent space with 200-500ms latency
- Data: RAVE: two-stage training (representation learning + adversarial fine-tuning); multi-band pseudo-QMF decomposition; AFTER: polyphonic when trained on polyphonic data; Max for Live integration
- Sources: Caillon & Esling 2021; Demerlé et al. 2024; Neural Analog documentation
- Table: Latency comparison (CataRT <10ms, RAVE <10ms, AFTER 200-500ms, CoSaRef offline)

#### Present kNN-SVC and Latent Granular Resynthesis as neural concatenative approaches
- Content point: kNN-SVC extends kNN-VC with temporal concatenation cost and additive synthesis for singing voice conversion; Latent Granular Resynthesis uses neural audio codec latent spaces (EnCodec, SoundStream) for training-free concatenation with implicit decoder interpolation
- Data: kNN-SVC presented at ICASSP 2025; SelectTTS achieves 8x parameter reduction vs. XTTS-v2, 270x training data reduction; Latent Granular Resynthesis non-autoregressive and streamable
- Sources: Shao et al. ICASSP 2025; SelectTTS arXiv 2408.17432; Tokui & Baker arXiv 2507.19202
- Connection: Links to Chapter 9 (Future Directions, where embedded neural hardware is discussed)

### 4.3 Neural Augmentation of Classical Pipelines

#### Document neural-guided unit selection in speech synthesis
- Content point: Apple's Siri on-device TTS uses mixture density networks to predict target and concatenation distributions; University of Edinburgh's DNN-guided unit selection in Festival Multisyn framework outperformed HMM-guided approaches
- Data: Siri TTS deployed to hundreds of millions of devices; Merritt et al. ICASSP 2016 showed DNN context embeddings from bottleneck layers outperformed HMM-generated parameters
- Sources: Capes et al. Interspeech 2017; Merritt et al. ICASSP 2016
- Connection: Links to Chapter 8 (full speech synthesis discussion)

#### Present neural vocoders for concatenative output smoothing
- Content point: Explain how WaveNet, HiFi-GAN, and neural codecs (SoundStream, EnCodec, AudioDec) are used to smooth discontinuities between concatenated units; the neural decoder interpolates across join points
- Data: SoundStream: fully convolutional encoder/decoder + residual vector quantizer, trained end-to-end; EnCodec used as backbone for multiple TTS and music generation systems
- Sources: SoundStream arXiv 2107.03312; various neural codec papers from Dim 09
- Connection: Summarizes the "convergence" thesis — neural methods absorbed into concatenative pipeline at every stage

---

## Chapter 5: Commercial Tools and Market Landscape
**Word Target**: 1,300-1,600 | **Primary Dimensions**: Dim 05, parts of Dim 06
**Narrative Arc**: Arc 4 (Legal Risk as Invisible Architect) — market analysis
**Placement**: After Neural Convergence

### 5.1 The Stark Market Reality

#### Document the "exactly one commercial plugin" finding
- Content point: Datamind Audio Concatenator (2025, $149 VST/AU/AAX) is the sole commercial plugin implementing true corpus-based concatenative synthesis with descriptor-driven unit selection; contrast with dozens of granular plugins
- Data: Granular plugins: Portal ($149), Pigments (~$199), Granulator III (free), Falcon ($349+), Omnisphere ($479+); none use descriptor-based unit selection from heterogeneous corpora
- Sources: Synthtopia 2025; Sound on Sound 2025; KVR Audio forums; product documentation
- Table: Granular vs. concatenative synthesis plugin comparison (20+ granular products vs. 1 concatenative)

#### Present the game audio middleware gap
- Content point: Wwise and FMOD collectively command ~67% of a $1.47B game audio middleware market (growing at 13.2% CAGR); SoundSeed provides procedural audio but zero corpus-based concatenative synthesis; identify this as the largest untapped market
- Data: $1.47B market size 2024; 13.2% CAGR; Wwise+FMOD ~67% penetration
- Sources: Growth Market Reports; DataIntelo; Dim 05 commercial landscape
- Connection: Links to Chapter 9 (Future Directions, where game audio is identified as opportunity)

### 5.2 Academic and Open-Source Tools

#### Catalog the IRCAM ecosystem and access models
- Content point: CataRT-MuBu free (requires Max $399); CataRT standalone and SKataRT require IRCAM Forum subscription (~200 EUR/year); AudioGuide free open-source (Python, offline, outputs AAF/Csound/bach.roll); Mosaïque free (Max for Live, FRQSC/OICRM funded)
- Data: CataRT available since 2006; AudioGuide ~2010; Mosaïque 2024-2025
- Sources: VI-Control forums; IRCAM documentation; AudioGuide website; Zenodo
- Table: Access model comparison (free/open, subscription, one-time purchase, DAW requirement)

#### Present FluCoMa and the artist-developer community
- Content point: FluCoMa toolkit enables KDTree-based real-time concatenative synthesis; ReaCoMa ports to REAPER; active community with SuperCollider examples; funded by AHRC/ERC but long-term sustainability uncertain
- Data: Release 1.0.0 May 2020; transitioned to Conservatorio della Svizzera italiana hosting September 2024
- Sources: FluCoMa Learn; CCRMA workshop; Tremblay et al. documentation
- Connection: Links to Chapter 7 (Creative Practice, where FluCoMa artist case studies are discussed)

### 5.3 Hardware and the Absence of Concatenative Instruments

#### Document the hardware granular market as a contrast case
- Content point: List granular hardware instruments: Waldorf Iridium (~$2,500), Quantum (~$4,000+), 1010music Lemondrop (~$399), Torso S-4 ($899), Intellijel Multigrain ($479), Make Noise Morphagene ($529); note zero descriptor-driven concatenative hardware exists
- Data: Hardware prices listed above; all are position-based granular, not descriptor-based concatenative
- Sources: Synthtopia; Perfect Circuit; manufacturer documentation
- Connection: Links to Chapter 9 (Future Directions, where NeuroRave and embedded deployment are discussed)

#### Analyze why concatenative synthesis has no hardware presence
- Content point: Present the gap analysis: computational requirements of real-time corpus matching on embedded DSPs, memory constraints for descriptor storage, power budgets, and the fundamental UI challenge of navigating high-dimensional descriptor spaces with physical controls
- Data: NeuroRack (IRCAM) uses Jetson Nano for descriptor-based impact synthesis but is research prototype, not commercial product; RAVE on Raspberry Pi 4 and Jetson Nano demonstrated
- Sources: Dim 05; Dim 14; NVIDIA Developer Blog; NIME 2023 paper
- Connection: Links to Chapter 9 (embedded neural hardware discussion)

---

## Chapter 6: Creative Practice: Audio Mosaicing and Compositional Techniques
**Word Target**: 1,300-1,600 | **Primary Dimensions**: Dim 07, parts of Dim 12
**Narrative Arc**: Arc 5 (The Instrument Revolution) — compositional dimension
**Placement**: After Market Landscape

### 6.1 Audio Mosaicing as Compositional Methodology

#### Trace audio mosaicing from Zils & Pachet (2001) through Driedger et al. (2015)
- Content point: Present Zils & Pachet's "Musaicing" as constraint satisfaction problem with cardinality constraints; MoSievius (Lazier & Cook, DAFx 2003) as real-time interactive extension; Driedger's NMF-based "Let It Bee" approach using sparse diagonal structures to preserve source timbre
- Data: Zils & Pachet at Sony CSL Paris; Lazier & Cook at Princeton; Driedger at Audio Labs Erlangen (ISMIR 2015)
- Sources: ISMIR 2005 (citing Zils & Pachet 2001); DAFX 2003 MoSievius; ISMIR 2015 Let It Bee
- Table: Audio mosaicing algorithm comparison (constraint-based, NMF-based, Bayesian, nearest-neighbor)

#### Present Schwarz & Hackbarth's "solution spaces" for compositional exploration
- Content point: Explain the method: run concatenative algorithm on 729 descriptor weight combinations (3^6), visualize via MDS with mass-spring-damper physical model; composers browse, audition, and compose paths through the solution space; target distances map to link lengths, inter-solution variation distances create links between all pairs
- Data: 729 parameter combinations; MDS uses mass-spring-damper model; spiral and cluster organizations emerge
- Sources: Schwarz & Hackbarth ICMC 2012; HAL archive 2015
- Figure: Conceptual diagram of solution space with target as fixed mass and variation distances creating emergent structure

### 6.2 Corpus-as-Compositional-Material

#### Document "composition by navigation" and cross-selection between corpora
- Content point: Explain how CataRT enables "re-arranging" recorded sound, "composition by navigation" through heterogeneous databases, and "cross-selection" to morph between different corpora; describe spatialized timbre (Einbond & Schwarz) mapping descriptor space to concert hall spatialization
- Data: These techniques documented in Schwarz 2007 paper on musical applications; cross-selection enables timbral morphing between entirely different sound sources
- Sources: Schwarz et al. ICMC 2007; Einbond papers referenced in Dim 07
- Connection: Links to Chapter 7 (Live Performance, where navigation becomes gestural)

#### Present AudioGuide as the non-real-time creative framework
- Content point: Document AudioGuide's unique capabilities: dense sound layering impossible in real-time, hierarchical search passes, corpus filtering, subtractive spectral algorithm for simultaneous corpus unit selection; outputs to Csound, Pro Tools/Logic (AAF), bach.roll notation
- Data: Written in Python but uses simple options files (no Python knowledge required); used in Hackbarth's "Volleys of Light and Shadow" (2014)
- Sources: Hackbarth et al. IRCAM 2010; AudioGuide official website
- Connection: Links to Chapter 8 (Algorithmic Composition, where bach.roll notation is discussed)

### 6.3 Recent Creative Tools and Directions

#### Present VIVO and multimodal corpus synthesis (2024)
- Content point: Document VIVO (Video Analysis for Corpus-based Audio-Visual Synthesis) extending CBCS to visual corpora; video-specific descriptors (warmness, detail, blur sharpness) mapped to audio synthesis parameters; "Spaces of Spaces" (SMC 2025) for room impulse response corpora
- Data: Matéo Fayet, Diemo Schwarz, Vincent Tiffon; JIM 2024 proceedings
- Sources: HAL JIM 2024; Schwarz HAL CV 2025
- Connection: Links to Chapter 9 (Future Directions, where multimodal corpora are discussed)

#### Document the plunderphonics lineage as manual audio mosaicing
- Content point: Present John Oswald's 1985 essay "Plunderphonics, or Audio Piracy as a Compositional Prerogative"; the 1989 album created entirely through manual tape splicing; Negativland's legal provocations; the conceptual continuity between tape splicing and algorithmic concatenation
- Data: 1985 essay; 1989 album; manual tape splicing prefiguring algorithmic approaches
- Sources: Wikipedia Plunderphonics; Sound Collage digication; Dim 07; Dim 13
- Connection: Links to Chapter 9 (Legal dimensions, where sampling law is detailed)

---

## Chapter 7: Live Performance and Improvisation
**Word Target**: 1,400-1,700 | **Primary Dimensions**: Dim 08, parts of Dim 04, Dim 12
**Narrative Arc**: Arc 5 (The Instrument Revolution) — performance dimension
**Placement**: After Creative Practice

### 7.1 CataRT as Digital Musical Instrument

#### Formalize the "sound space" concept from the NIME 2012 paper
- Content point: Present the NIME 2012 paper "The Sound Space as Musical Instrument" as the foundational document establishing CBCS as a DMI; explain how the corpus topology becomes the instrument and the performer navigates it; describe the inversion of traditional sampling ontology
- Data: NIME 2012 proceedings; CataRT uses PCA for 2D/3D projection of high-dimensional descriptor data
- Sources: Schwarz NIME 2012; Dim 08; Dim 04
- Figure: Diagram comparing traditional sampler (trigger pre-recorded samples) vs. CataRT DMI (navigate timbre space)

#### Present the critical assessment of CataRT as performance instrument
- Content point: Document Schwarz's self-critical evaluation: strengths include wide dynamic/timbral range, sonic neutrality, capacity to "throw around clouds of grains"; weaknesses include rhythmic precision ("nearly impossible to vary enough to be musically interesting"), visual feedback dependency creating performer-screen separation
- Data: Rhythmic imprecision stems from segmentation alignment jitter and gestural controller latency; memorizing corpus layout enables screen-free performance (demonstrated in "Boucle#1")
- Sources: Schwarz NIME 2012; Dim 08
- Connection: Links to Chapter 9 (Future Directions, where the "temporal blind spot" is addressed)

### 7.2 Gestural Control and Trigger Modes

#### Catalog controller types and their musical affordances
- Content point: Systematically present: 2D positional controllers (mouse, KAOSS Pad, joystick); pressure-sensitive surfaces (Wacom tablet — pressure+tilt; STC-1000 — 3x3 pressure grid, multi-touch distance); multi-touch screens; inertial/motion sensors (Wiimote, smartphones, Kinect); audio-driven control (piezo mics, live audio analysis)
- Data: Wacom tablet couples selection (position) with excitation (pressure); STC-1000 allows standing performance; piezo mics create "prepared object" hybrid instruments
- Sources: Schwarz NIME 2012; Dim 08
- Table: Controller taxonomy with selection/excitation/modification gesture mappings per Cadoz framework

#### Detail trigger modes as fundamental instrument design decisions
- Content point: Present dynamic modes (grab — speed controls grain density; fence — swiping triggers arpeggio-like sequences; one-shot — discrete trigger) vs. textural modes (beat — metronome-driven with selection controlling timbre; chain — seamless unit chains; continue — original temporal order playback)
- Data: Beat mode at fast rates creates dense overlapping textures; chain mode creates rhythmic ostinato from corpus's own temporal structures; continue mode allows "scratching" through original recordings
- Sources: Schwarz NIME 2012; Schwarz JIM 2008
- Connection: Links to Chapter 3 (Real-Time Systems, where trigger scheduling is implemented)

### 7.3 Human-Machine Co-Improvisation Systems

#### Present IRCAM's lineage: OMax → Somax2 → Dicy2
- Content point: Explain OMax's Factor Oracle for "stylistic reinjection" (Assayag & Dubnov); Somax2's corpus-based multi-layered approach with "influences" activating peaks across harmony, melody, dynamics, timbre layers (ERC REACH project); Dicy2 as Max/Ableton Live package with free/reactive/scenario-based generation modes
- Data: OMax used with Bernard Lubat, Joëlle Léandre, Steve Lehman; Somax2 v2.6 adds real-time live corpus recording, multi-region handling, beat phase optimization; Dicy2 released 2022
- Sources: IRCAM resources; Assayag & Dubnov papers; Dim 08
- Connection: Links to Chapter 8 (Algorithmic Composition, where symbolic improvisation agents are discussed)

#### Present Metacreation Lab's MASOM, MACAT, and MACataRT
- Content point: Document MASOM's three-component architecture (SOM for timbre memory, VMM for temporal structure, affective computing for emotional responsiveness); MACAT's Factor Oracle integration for real-time pattern recognition; MACataRT's explicit bridging of CataRT with autonomous generation
- Data: MASOM uses 31-dimensional feature vectors; SOM clusters similar sounds on 2D grid; VMM adapts memory length based on context; MACataRT offers reactive and proactive improvisation modes
- Sources: Tatar & Pasquier 2017; Metacreation Lab papers; Dim 08
- Connection: Links to Chapter 9 (Future Directions, where embodied machine learning is discussed)

---

## Chapter 8: Speech Synthesis Cross-Domain and Algorithmic Composition
**Word Target**: 1,200-1,500 | **Primary Dimensions**: Dim 11, Dim 12
**Narrative Arc**: Arc 2 (Speech-Music Divergence) — cross-domain analysis
**Placement**: Penultimate technical chapter

### 8.1 The Speech-Music Divergence: Opposite Trajectories

#### Document speech synthesis's journey from concatenative to neural
- Content point: Trace the arc: diphone synthesis (Moulines & Charpentier 1990 PSOLA) → Hunt & Black unit selection (1996) → HMM-based parametric synthesis (HTS, Tokuda/Zen) → neural TTS (WaveNet 2016, Tacotron, VALL-E/VALL-E 2 achieving "human parity")
- Data: VALL-E trained on 60,000 hours; VALL-E 2 first to achieve human parity on LibriSpeech/VCTK; Amazon Polly offers four engines (Standard/concatenative, Neural, Long-Form, Generative); ElevenLabs at $3.3B valuation 2025
- Sources: Microsoft Research; Amazon Polly documentation; Anvevoice 2026 assessment; Dim 11
- Table: Speech synthesis technology timeline with quality and commercial adoption metrics

#### Present the critical finding that concatenative TTS retains specific advantages
- Content point: Cohn & Zellou (Interspeech 2020) experimentally found neural TTS is LESS intelligible in noise than concatenative TTS despite being rated more natural; concatenative persists for noise robustness, specific voice authenticity, low-resource environments
- Data: Cohn & Zellou peer-reviewed experimental study; Amazon confirmed neural TTS rated higher but concatenative has domain-specific persistence
- Sources: Cohn & Zellou Interspeech 2020; Amazon Science blog 2022; Dim 11
- Connection: Links to Chapter 4 (Neural Convergence, where Siri's MDN-guided unit selection is discussed)

#### Argue that music synthesis is moving in the opposite direction
- Content point: Present the inversion thesis: speech moved from concatenative → neural because the target is singular and well-defined (intelligible speech); music has no single target — musicians want idiosyncrasy, specific timbral identity, and surprise; neural models produce "plausible but generic" music; researchers now use concatenative methods to constrain neural generation to specific timbres
- Data: CoSaRef, The Concatenator, and kNN-SVC all represent movement from pure neural toward corpus-based methods; CoSaRef "outperformed state-of-the-art timbre-controllable method based on MIDI supervision"
- Sources: Dim 09; Dim 11; Dim 05; cross-dimension Insight 1
- Connection: Synthesizes evidence from Chapters 4, 5, and 9

### 8.2 Algorithmic Composition and Symbolic Control

#### Document IRCAM's Computer-Aided Composition lineage
- Content point: Trace PatchWork (Lisp visual interface) → OpenMusic (CLOS, Maquette concept) → OM# (redesigned framework, 2019); explain Jean Bresson's 2007 PhD thesis on integrating sound synthesis into compositional processes; OM-Diph for diphone-based concatenative synthesis in OpenMusic
- Data: OpenMusic 7.0 initiated 2022, reaching 7.7 December 2025; OMChroma (generalization of Stroppa's Chroma, 1980s) uses matrix representations for synthesis control
- Sources: Computer Music Journal 1998; Bresson PhD 2007; OpenMusic GitHub; Dim 12
- Table: IRCAM CAC environment evolution timeline

#### Present the bach library and symbolic concatenative synthesis
- Content point: Document bach as "automated composer's helper" bringing CAC into real-time Max; over 200 modules for note data processing; dada library extending to symbolic corpus modules; bach-CataRT integration storing CataRT grains as symbolic notes enabling corpus-derived notation
- Data: bach published Computer Music Journal 2015; created by Daniele Ghisi and Andrea Agostini
- Sources: Ghisi research page; Computer Music Journal 2015; IEEE Xplore bach paper; Dim 12
- Connection: Links to Chapter 6 (Creative Practice, where AudioGuide outputs bach.roll notation)

---

## Chapter 9: Legal, Ethics, and Future Directions
**Word Target**: 1,500-1,800 | **Primary Dimensions**: Dim 13, Dim 14
**Narrative Arc**: Arc 4 (Legal Risk as Invisible Architect); frontier speculation
**Placement**: Final chapter — synthesizes all prior chapters

### 9.1 Copyright Law as the Primary Commercial Bottleneck

#### Document the landmark sampling cases that shaped the legal landscape
- Content point: Present Grand Upright (1991) — Judge Duffy's "Thou shalt not steal" creating de facto rule that any unauthorized sampling is infringement; Bridgeport (2005) — "Get a license or do not sample" bright-line rule, even 2-second samples require licenses; estimate Paul's Boutique (125 samples) would cost ~$20 million to clear today
- Data: Grand Upright: Biz Markie "Alone Again" sampling Gilbert O'Sullivan; Bridgeport: 2-second Funkadelic guitar chord in I Spy; estimated clearance costs: $250,000 originally, ~$20 million today
- Sources: Wikipedia both cases; Dim 13 legal dimension
- Table: Landmark sampling cases with rulings, commercial impact, and concatenative synthesis implications

#### Present the AI litigation wave (2024-2026)
- Content point: RIAA lawsuits against Suno and Udio (June 2024) seeking up to $150,000 per infringed work (potentially billions); Thomson Reuters v. Ross Intelligence (February 2025) — first federal ruling rejecting fair use defense for AI training; GEMA v. OpenAI (November 2025) — Munich court ruled LLMs store reproducible copies, rejected TDM exception
- Data: Suno admitted training on copyrighted music, arguing fair use; EU AI Act formally adopted March 2024 mandates copyright compliance and training data summaries
- Sources: RIAA filings; Thomson Reuters ruling; GEMA ruling; EU AI Act documentation; Dim 13
- Connection: Explains Chapter 5's finding of "exactly one commercial plugin"

### 9.2 Open and Ethical Audio Corpora

#### Present FreeSound as the Creative Commons audio commons
- Content point: Document FreeSound (MTG/UPF Barcelona, launched 2005): 670,000+ sounds, 6.2M registered users by 2017, 94.2M cumulative downloads; 2024 AI guidelines interpreting CC licenses for generative AI; CC0/CC BY/CC BY-NC distinctions for model training
- Data: 327,000+ sounds by 2017; 16M downloads in 2017 alone; $35,000 Google Research grant 2009; Grant for the Web funding 2021
- Sources: FreeSound.org; UPF website; Wikipedia FreeSound; Dim 13
- Table: Creative Commons license matrix for concatenative synthesis corpus building

#### Present Barnett et al.'s training data attribution framework
- Content point: Explain the "informed creation" methodology: apply CLMR/CLAP embeddings to VampNet training data (795,000 songs) to identify most similar training songs to any generated output; moves from "ignorant appropriation to informed creation"
- Data: 5 million embeddings in Pinecone; Northwestern University (Bryan Pardo's group)
- Sources: Barnett et al. January 2024; Dim 13; Dim 10
- Connection: Links to Chapter 4 (Embedding infrastructure)

### 9.3 Emerging Paradigms and Frontier Directions

#### Present WebAssembly and browser-based concatenative synthesis
- Content point: SuperSonic (2025) demonstrates SuperCollider scsynth running in browser AudioWorklets via Emscripten WASM; WASM + AudioWorklet architecture provides near-native performance with sample-accurate timing; no dedicated browser-based concatenative system yet exists but infrastructure is mature
- Data: SuperSonic released late 2025; Emscripten guarantees no GC pauses in audio worklets; shared memory coordination between JS and WASM for sample playback
- Sources: Sam Aaron Patreon; CDM; Emscripten documentation; Dim 14
- Connection: Links to Chapter 3 (Real-Time Systems architecture)

#### Document embedded neural hardware and the NeuroRave/NeuroRack lineage
- Content point: NeuroRack (IRCAM ACIDS) — first hardware deep AI synthesizer in Eurorack, descriptor-based impact sounds on Jetson Nano; NeuroRave — F-RAVE model in Eurorack with CV/gate interaction; RAVE on Raspberry Pi 4 and Jetson Nano; BRAVE lightweight RAVE variant; AFTER on embedded platforms (200-500ms latency)
- Data: NeuroRack removes up to 95% of model weights without significant accuracy degradation (lottery ticket hypothesis); RAVE runs on sub-$100 hardware; AFTER operates near Pi 4's computational limit
- Sources: NVIDIA Developer Blog; Synthtopia; NIME 2023; Genova thesis 2026; Dim 14
- Connection: Links to Chapter 4 (RAVE/AFTER neural architectures) and Chapter 5 (hardware market absence)

#### Address the "temporal blind spot" and future research directions
- Content point: Argue that concatenative synthesis is fundamentally a timbre-space technology privileging spectral characteristics over rhythmic structure; descriptor sets (pitch, loudness, brilliance, noisiness, roughness) and trigger modes (density/overlap control, not metric placement) reveal this bias; MACAT's Factor Oracle points toward sequence learning but metric control remains unsolved
- Data: Schwarz's self-critical assessment of CataRT's "rhythmic precision" weakness; most unit selection optimizes for spectral/timbral similarity not rhythmic alignment
- Sources: Schwarz NIME 2012; Dim 03; Dim 08; cross-dimension Insight 8
- Connection: Synthesizes evidence from Chapters 2, 3, and 7

#### Conclude with the convergent future thesis
- Content point: Argue the future is not "concatenative vs. neural" but convergent architecture: CLAP embeddings for semantic corpus organization, kd-trees for fast retrieval, neural vocoders for transition smoothing, VAE latent spaces for interpolation, diffusion for refinement; concatenative selection provides identity and structure, neural methods provide smoothness, semantic retrieval, and efficiency
- Data: Embeddings excel at semantic retrieval but real-time integration remains challenge; handcrafted descriptors persist in live performance; transitional period ongoing
- Sources: Cross-dimension Insight 5; Dim 09; Dim 10; Dim 14
- Connection: Synthesizes all chapters into unified forward-looking conclusion

---

## Cross-Chapter Connection Matrix

| Chapter | Primary Sources | Forward Links | Backward Links |
|---------|----------------|---------------|----------------|
| 1. Foundations | Dim 01, Dim 06, Dim 11 | 2, 3, 8 | — |
| 2. Algorithmic Core | Dim 02, Dim 03 | 3, 4, 7 | 1 |
| 3. Real-Time Systems | Dim 04, Dim 05 | 4, 5, 7, 9 | 1, 2 |
| 4. Neural Convergence | Dim 09, Dim 10 | 5, 8, 9 | 2, 3 |
| 5. Commercial Landscape | Dim 05, Dim 06 | 6, 9 | 3, 4 |
| 6. Creative Practice | Dim 07, Dim 12 | 7, 9 | 3, 5 |
| 7. Live Performance | Dim 08, Dim 04 | 8, 9 | 2, 3, 6 |
| 8. Speech/Algorithmic | Dim 11, Dim 12 | 9 | 1, 4, 6, 7 |
| 9. Legal/Future | Dim 13, Dim 14 | — | All |

## Key Statistics to Include Throughout

### Technical Data Points
- Hunt & Black: target cost 20-30 sub-costs, concatenation cost 3 sub-costs, beam width 10-20 for near real-time on 100,000-unit database
- CataRT: 230 imported descriptors, Mahalanobis distance normalization, PCA-based kd-tree search
- CLAP: 71.9% human perceptual agreement (full mixes); Human-CLAP: SRCC 0.506 vs. 0.259 baseline
- MuQ-MuLan: 90.4% perceptual agreement with instrument-wise weighting; ROC-AUC 79.3 on MagnaTagATune
- MERT: SOTA on MARBLE with 330M parameters (7% of Jukebox's ~5B)
- RAVE: 48kHz audio, 20x faster than real-time on laptop CPU, <10ms latency
- AFTER: 200-500ms latency (diffusion denoising steps)
- Concatenator: O(Pp) complexity, independent of corpus size N, scales to hours-long corpora
- SelectTTS: 8x parameter reduction vs. XTTS-v2, 270x training data reduction

### Market Data Points
- Exactly one commercial concatenative plugin: Concatenator (2025, $149)
- Dozens of granular plugins exist (Portal $149, Pigments ~$199, Falcon $349+, Omnisphere $479+)
- Game audio middleware: $1.47B market 2024, 13.2% CAGR; Wwise+FMOD ~67% penetration
- No hardware implements true descriptor-driven concatenative synthesis
- CataRT-MuBu 1.7.0 September 2025; Mosaïque v0.2 August 2025
- SKataRT requires IRCAM Forum subscription (~200 EUR/year)
- Max license: $399 full, or subscription

### Legal Data Points
- Grand Upright (1991): "Thou shalt not steal" — any unauthorized sampling = infringement
- Bridgeport (2005): "Get a license or do not sample" — even 2-second samples require license
- Paul's Boutique (125 samples): ~$20 million estimated clearance cost today
- RIAA v. Suno/Udio (June 2024): up to $150,000 per infringed work, potentially billions
- Thomson Reuters v. Ross Intelligence (February 2025): first federal ruling rejecting fair use for AI training
- GEMA v. OpenAI (November 2025): Munich court rejected TDM exception for LLMs
- FreeSound: 670,000+ sounds, 6.2M users by 2017, 94.2M cumulative downloads
- EU AI Act: formally adopted March 2024, mandates copyright compliance and training data summaries

## Recommended Tables and Figures Summary

### Tables (minimum 12)
1. Chapter 1: Timeline of sampler democratization (1981-1987)
2. Chapter 1: Hunt & Black framework vs. earlier diphone synthesis
3. Chapter 2: Descriptor taxonomy with relevance ratings
4. Chapter 2: Cost function components and perceptual motivations
5. Chapter 2: Search structure comparison (corpus size, query time, recall)
6. Chapter 3: Tool comparison matrix (platform, real-time, price, corpus limit)
7. Chapter 4: Embedding model comparison (CLAP, MuQ-MuLan, MERT, CLaMP 3)
8. Chapter 4: Latency comparison across systems
9. Chapter 5: Granular vs. concatenative plugin comparison
10. Chapter 7: Controller taxonomy with gesture mappings
11. Chapter 8: Speech synthesis technology timeline
12. Chapter 9: Landmark sampling cases; CC license matrix

### Figures (minimum 8)
1. Chapter 1: STFT analysis/synthesis pipeline block diagram
2. Chapter 1: Caterpillar vs. CataRT architectural comparison
3. Chapter 2: Descriptor extraction pipeline (audio → SDIF → matrix)
4. Chapter 2: 2D descriptor space with target point and nearest-neighbor selection
5. Chapter 3: CataRT data flow diagram (input → analysis → selection → synthesis)
6. Chapter 4: CLAP embedding workflow (audio → inference → vector → database → query)
7. Chapter 7: Traditional sampler vs. CataRT DMI conceptual diagram
8. Chapter 9: Convergent architecture diagram (embeddings + search + neural smoothing + VAE interpolation)

## Source Tier Guidelines for Report Writing

### Tier 1 (Peer-Reviewed Academic) — ~60% of citations
- Hunt & Black ICASSP 1996; Schwarz DAFx-06, JNMR 2006, IEEE SPM 2007; Peeters et al. 2011 JASA; McAdams et al. perceptual timbre research; Tralie & Cantil ISMIR 2024; Take & Akama arXiv 2024/2025 (CoSaRef); Caillon & Esling 2021 (RAVE); Shao et al. ICASSP 2025 (kNN-SVC); Capes et al. Interspeech 2017 (Siri TTS); Merritt et al. ICASSP 2016; Wu et al. ICASSP 2023 (CLAP); Zhu et al. 2025 (MuQ-MuLan); Li et al. 2023 (MERT); Barnett et al. 2024; Cohn & Zellou 2020 Interspeech

### Tier 2 (Industry/Institutional) — ~30% of citations
- Sound on Sound, Synthtopia product coverage; IRCAM documentation; FluCoMa Learn; FreeSound/UPF; Audiobrain/TheMusicCase; AudioCipher DataMind profile; Growth Market Reports; Vapi.ai blog

### Tier 3 (Forum/Speculative) — ~10% of citations, used cautiously
- VI-Control forum opinions (representative but anecdotal); WebAssembly capability claims (theoretical, no specific implementation); neuromorphic/quantum claims (aspirational); blockchain attribution (no scale deployment)
