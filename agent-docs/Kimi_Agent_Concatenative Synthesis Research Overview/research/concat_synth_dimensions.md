# Dimension Decomposition: Concatenative Synthesis Deep Research

## Dimension 01: Technical Foundations & DSP Architecture
**Angle**: Historical and technical evolution of concatenative synthesis as a signal processing paradigm.
**Scope**: From Musique Concrète tape splicing through digital sampling to modern corpus-based methods. Analysis/synthesis pipelines, STFT/phase vocoder foundations, unit segmentation strategies (uniform vs event-based vs onset detection), overlap-add concatenation, crossfade techniques, spectral continuity.
**Expected Sources**: IRCAM papers, Diemo Schwarz PhD thesis, IEEE Signal Processing Magazine, Roads' Microsound, DAFX proceedings, ICMC papers.
**Overlap With**: Dim 02 (descriptors), Dim 04 (real-time), Dim 06 (granular synthesis).

## Dimension 02: Descriptor Extraction & Feature Spaces
**Angle**: The representation layer — how sound units are characterized for retrieval and matching.
**Scope**: Low-level descriptors (MFCC, spectral centroid, rolloff, flux, flatness), perceptual descriptors (pitch, loudness, brilliance, noisiness, roughness, inharmonicity), MPEG-7 audio descriptors, higher-level metadata (instrument class, phoneme labels). SDIF format, FTM/Gabor analysis. Dimensionality reduction (PCA, MDS, t-SNE, UMAP) for visualization. Modern deep audio embeddings as descriptors.
**Expected Sources**: IRCAM tech reports, Peeters' Cuidado descriptor set, ECRINS, AudioSet, CLAP/MERT papers.
**Overlap With**: Dim 01, Dim 09, Dim 10.

## Dimension 03: Unit Selection Algorithms & Search Strategies
**Angle**: The algorithmic core — how matching units are found and sequenced.
**Scope**: Nearest-neighbor search in descriptor space, Euclidean/Mahalanobis distance, weighted distance functions. Dynamic programming for optimal sequences (Viterbi). Target cost vs concatenation cost. Constraint satisfaction (ringomatic). Factor Oracle / suffix automata for pattern matching. Efficient search structures (kd-trees, PCA branch-and-bound, vector databases). Real-time search constraints.
**Expected Sources**: Schwarz papers, Aucouturier/Pachet work, Roy et al. on speeding NN search, VMM/Factor Oracle literature.
**Overlap With**: Dim 01, Dim 04, Dim 08.

## Dimension 04: Real-Time Systems & Software Architectures
**Angle**: The engineering of interactive, low-latency concatenative synthesis.
**Scope**: CataRT (Max/MSP + FTM/Gabor/MnM), Mosaïque (Max for Live), C-C-Combine, AudioGuide, FluCoMa toolkit, dada library for Max. Buffer management, streaming audio input for live corpus building, scheduling, multi-threading. RAM vs disk streaming trade-offs. Standalone vs plugin architectures. Open source vs commercial.
**Expected Sources**: DAFX 2006 CataRT paper, NIME 2012 performance paper, Mosaïque workshop papers, FluCoMa documentation, Max for Live device listings.
**Overlap With**: Dim 01, Dim 03, Dim 07.

## Dimension 05: Commercial Tools & Market Landscape
**Angle**: What musicians and sound designers can actually buy and use today.
**Scope**: Datamind Audio Concatenator (2025), Mosaïque, Kontakt (native instruments granular/cellular), Falcon (UVI), Omnisphere (Spectrasonics), Iris (iZotope), Reaktor (Native Instruments), Max for Live ecosystem, Ableton Live Corpus device. Game audio middleware (Wwise SoundSeed, FMOD). Pricing, target users, adoption rates, market gaps. Hardware instruments (if any).
**Expected Sources**: Synthtopia, Gearnews, product websites, user forums, Reddit, KVR Audio.
**Overlap With**: Dim 04, Dim 06.

## Dimension 06: Granular Synthesis Connections & Divergences
**Angle**: Positioning concatenative synthesis within the broader granular paradigm.
**Scope**: Curtis Roads' granular synthesis tradition, Barry Truax, granular vs unit-based selection. "Granular synthesis is rudimentarily corpus-based" (Schwarz). Differences in control: position-based vs descriptor-based. Overlap with synchronous/asynchronous granular synthesis. Time-domain vs frequency-domain granulation. Clouds, Texture, modern granular plugins (Portal, Granular, etc.).
**Expected Sources**: Roads' Microsound, Truax papers, Schwarz CataRT comparisons, plugin manufacturers.
**Overlap With**: Dim 01, Dim 04, Dim 05.

## Dimension 07: Audio Mosaicing & Creative Compositional Techniques
**Angle**: The artistic methodology of working with sound corpuses as compositional material.
**Scope**: Audio mosaicing as resynthesis of targets. Solution spaces (Schwarz & Hackbarth). Composition by navigation. Cross-selection and interpolation between corpora. Corpus-based orchestration. Live corpus building. Spatializing timbre (Einbond & Schwarz). Timbre space as compositional interface. Video/image-to-sound mosaicing parallels.
**Expected Sources**: Schwarz & Hackbarth 2015, Einbond papers, ICMC compositions, eContact articles.
**Overlap With**: Dim 04, Dim 08, Dim 12.

## Dimension 08: Live Performance & Improvisation Systems
**Angle**: Concatenative synthesis as a new interface for musical expression (NIME perspective).
**Scope**: CataRT as DMI. Gesture controllers (positional, inertial, audio analysis). Piezo mics, Wacom tablets, Kinect, RMI, custom sensors. Trigger modes (one-shot, beat, chain, continue). MACAT/MASOM (Metacreation Lab). Factor Oracle for real-time pattern generation. Live coding with concatenative synthesis. Free improvisation. Duo/trio performance setups.
**Expected Sources**: NIME 2012 paper, NIME proceedings, Schwarz JIM 2008, Metacreation Lab papers.
**Overlap With**: Dim 04, Dim 07, Dim 12.

## Dimension 09: Neural Concatenative Synthesis & Deep Learning Hybrids
**Angle**: The intersection of deep learning with corpus-based methods.
**Scope**: CoSaRef (concatenative + diffusion refinement, 2024). Differentiable concatenative synthesis. Neural unit selection. VAE-based latent corpus spaces. RAVE for real-time neural audio synthesis (not strictly concatenative but relevant). DDSP and timbre transfer. Neural audio mosaicing. Using neural vocoders for concatenative output smoothing. Neural TTS unit selection improvements.
**Expected Sources**: arXiv CoSaRef, ISMIR 2024, RAVE papers, DDSP, neural audio synthesis surveys.
**Overlap With**: Dim 02, Dim 10, Dim 11.

## Dimension 10: Audio Embeddings & Semantic Corpus Retrieval
**Angle**: How modern pretrained audio representations enable next-generation corpus navigation.
**Scope**: CLAP, CLMR, MuQ-MuLan, MERT, AudioSet embeddings. Semantic similarity vs acoustic similarity. Text-to-audio retrieval. Vector databases (FAISS, Pinecone, Qdrant) for million-scale audio corpora. Zero-shot classification for corpus organization. Embedding-based nearest neighbor as replacement for handcrafted descriptors. Cross-modal control.
**Expected Sources**: CLAP papers, CLMR, Inst-Sim-ABX dataset, Audiobrain, Hugging Face models.
**Overlap With**: Dim 02, Dim 09, Dim 12.

## Dimension 11: Speech Synthesis Cross-Domain Learning
**Angle**: What musical concatenative synthesis can learn from (and teach) speech synthesis.
**Scope**: Unit selection speech synthesis (Hunt & Black). HMM-based synthesis. Deep learning TTS (Tacotron, WaveNet, FastSpeech). Concatenative vs neural TTS debate — intelligibility in noise (Cohn & Zellou). Talkapillar. Cross-domain hybrids (music + speech). Emotional/expressive speech synthesis. Diphone synthesis.
**Expected Sources**: Interspeech papers, Speech Synthesis Workshops, IEEE TASLP, Cohn & Zellou 2020.
**Overlap With**: Dim 03, Dim 09, Dim 12.

## Dimension 12: Algorithmic Composition & Computer-Aided Orchestration
**Angle**: The symbolic/mathematical composition tradition interfacing with corpus-based sound.
**Scope**: OpenMusic and OM-SuperVP, OM-Diph. Computer-assisted composition (CAC). High-level symbolic control of sound processing. Score-driven concatenative synthesis. Automatic orchestration (OrchIDS, Orch*). Constraint programming for unit selection. Bach library (Max). dada library. Generating notation from corpus selection.
**Expected Sources**: OpenMusic documentation, OM-SuperVP papers, Bresson papers, OrchIDS research.
**Overlap With**: Dim 07, Dim 08, Dim 11.

## Dimension 13: Legal, Ethical & Copyright Dimensions
**Angle**: The socio-legal infrastructure around corpus building and sampling.
**Scope**: Copyright law and audio sampling. FreeSound project. Creative Commons in music AI. Intellectual property of training corpora. Attribution and influence detection (Barnett et al.). Ethical sourcing of voice corpora. Plunderphonics tradition as legal/artistic provocation. Citation practices in sound art.
**Expected Sources**: FreeSound papers, Barnett et al. on VampNet attribution, legal scholarship on sampling, Creative Commons documentation.
**Overlap With**: Dim 05, Dim 07.

## Dimension 14: Future Directions & Emerging Paradigms
**Angle**: Speculative and early-stage developments at the frontier.
**Scope**: WebAssembly for browser-based concatenative synthesis. Hardware embedding (NeuroRave). Real-time diffusion for concatenative refinement. Multimodal corpora (audio + video + motion). AI-assisted corpus curation. Generative corpus expansion (using GANs/diffusion to augment databases). Personal voice cloning + concatenative. Spatial audio/AMBISONICS with corpus methods. HRTF-based corpus spatialization.
**Expected Sources**: arXiv preprints, ISMIR 2024/2025, ICMC recent papers, NIME recent, company blogs.
**Overlap With**: Dim 09, Dim 10, Dim 11.
