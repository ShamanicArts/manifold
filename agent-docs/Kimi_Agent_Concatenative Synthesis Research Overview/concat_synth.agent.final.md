# Concatenative Synthesis: Principles, Practice, and the Neural Convergence

## 1. Introduction and Conceptual Framework

### 1.1 Defining Concatenative Synthesis

Concatenative synthesis is a corpus-based audio generation paradigm in which new sounds are assembled by selecting and joining short segments—*units*—drawn from a pre-analyzed database of recordings. The process is defined by four sequential stages: (1) a target specification, which may be a descriptor vector, a text prompt, or a live audio input; (2) a corpus $C$ of recorded units, each segmented and annotated with feature descriptors; (3) a unit selection algorithm that searches $C$ for sequences matching the target; and (4) a concatenation stage in which selected units are crossfaded or overlap-added to produce a continuous output stream [^1^][^3^].

The selection problem was formalized by Hunt and Black (1996) for speech synthesis and later adapted to musical sound by Schwarz [^22^][^5^]. Given a target specification $T$ and a corpus $C$, the objective is to find a sequence of units $\{u_1, \dots, u_n\}$ from $C$ that minimizes a joint cost function

$$J = \sum_{i=1}^{n} C^{\mathrm{t}}(u_i, T) + \sum_{i=1}^{n-1} C^{\mathrm{c}}(u_i, u_{i+1})$$

where $C^{\mathrm{t}}$ denotes the *target cost*—a weighted sum of sub-costs measuring mismatch between a candidate unit and the desired target features—and $C^{\mathrm{c}}$ denotes the *concatenation cost*, which estimates the spectral, fundamental frequency, and power continuity across a join boundary [^22^]. In musical applications, the target is frequently a point in a multi-dimensional descriptor space (e.g., spectral centroid, loudness, noisiness) navigated by a performer in real time, rather than a predetermined phoneme sequence [^1^].

This report addresses *musical* concatenative synthesis: systems in which the corpus is a heterogeneous collection of recorded sounds, the target is defined by timbral or semantic descriptors, and the output is intended for composition or live performance. The scope explicitly excludes pure parametric synthesis—frequency modulation (FM), subtractive, or additive methods that generate waveforms from mathematical models—and also excludes simple keyzone sampling in which playback is triggered by MIDI note and velocity without content-based unit selection [^3^].

### 1.2 Comparative Synthesis Paradigms

Concatenative synthesis occupies a distinct position in the landscape of sample-based sound generation. Its closest neighbors are granular synthesis, wavetable synthesis, and conventional sampling; the differences lie in unit size, selection logic, and the relationship between the performer and the corpus.

**Concatenative vs. granular synthesis.** Granular synthesis, first implemented digitally by Curtis Roads in 1974 and brought to real-time performance by Barry Truax in 1986, operates on grains of approximately 1–50 ms selected by temporal position within a single sound file [^6^]. Diemo Schwarz characterized granular synthesis as "rudimentarily corpus-based": it performs no analysis, uses arbitrary grain sizes, and limits selection to position within one file [^7^]. Concatenative synthesis extends this model by adding descriptor analysis and content-based selection across a multi-source corpus, enabling navigation by sound characteristics rather than by playback position [^1^]. The unit size distinction is consequential: granular grains at densities above 100 grains per second fuse into continuous texture, whereas concatenative units—typically 100 ms to several seconds—preserve the morphological identity of their source recordings [^6^].

**Concatenative vs. wavetable synthesis.** Wavetable synthesis, pioneered by Wolfgang Palm at PPG in the late 1970s, stores single-cycle waveforms in indexed tables and retrieves them at variable playback rates to produce pitched output. Modern implementations use frames of approximately 2,048 samples per cycle with interpolation between adjacent tables to create evolving timbres. The corpus in wavetable synthesis is a homogeneous, pre-analyzed sequence of periodic waveforms from a single source; spectral fidelity is high but timbral idiosyncrasy is low because the output is constructed from abstracted cycles rather than full recordings. Concatenative synthesis, by contrast, draws from heterogeneous, multi-source corpora and retains the full spectral and temporal envelope of each selected unit.

**Concatenative vs. sampling and ROMplers.** Conventional sampling instruments organize recordings into keyzones and velocity layers, triggering a specific sample when a MIDI note falls within a defined range. Selection is deterministic: note number plus velocity maps to a predetermined waveform. Concatenative synthesis inverts this relationship. The corpus becomes a navigable timbre space; the same input target may retrieve different units on each query depending on the descriptor match. In this framing, the corpus is not merely material to be played back, but an instrument whose topology defines the playable space [^3^].

The following table summarizes these distinctions across six operational dimensions.

| Dimension | Concatenative | Granular | Wavetable | Sampling / ROMpler |
|-----------|--------------|----------|-----------|-------------------|
| Unit size | 100 ms–several s [^1^] | 1–50 ms [^6^] | Single cycle (~2–50 ms) | Full note / phrase |
| Selection logic | Descriptor-based (content) [^1^] | Position-based [^7^] | Index-based (table position) | Key + velocity trigger |
| Corpus composition | Multi-source, heterogeneous [^3^] | Usually single file [^7^] | Homogeneous single source | Multi-sample keyzone map |
| Analysis required | Segmentation + descriptors [^1^] | None | Wavetable extraction | Optional (loop points) |
| Timbral outcome | Idiosyncratic, source-identifiable [^5^] | Textural, abstract | Predictable, periodic | Literal playback |
| Real-time capability | Greedy nearest-neighbor or offline [^1^] | Yes | Yes | Yes |

The table reveals that concatenative synthesis is the only paradigm in this group that combines multi-source corpora with content-based selection and unit sizes large enough to preserve source identity. These properties give it a unique sonic signature—one that is immediately identifiable as a distinct synthesis category despite its technical overlaps with granular and sampling methods. The commercial market reflects this categorical separation: dozens of granular plugins (Output Portal, Arturia Pigments, Ableton Granulator III) and wavetable instruments (Xfer Serum, Vital) are available, while concatenative synthesis remained confined to research environments until the release of DataMind Audio's Concatenator in 2025 [^11^]. This market asymmetry is not merely a matter of commercial preference; it reflects fundamental differences in implementation complexity, user interface design, and the analytical overhead required to prepare a navigable corpus.

### 1.3 The Core Proposition: Identity Through Selection

The defining perceptual characteristic of concatenative synthesis is what might be termed the *source recognition effect*: listeners can often identify the original recordings from which units are drawn, even when those units are sequenced into novel arrangements [^5^]. This effect arises because the selected units retain their full spectral envelope, temporal microstructure, and recording context. Unlike wavetable or granular output, which tends toward abstraction, concatenative synthesis produces *idiosyncratic* sound—output that carries the imprint of specific source materials.

The dimensions of control available to composers and performers have expanded substantially over the past two decades. Early systems such as CataRT relied on handcrafted spectral descriptors: Mel-frequency cepstral coefficients (MFCC), spectral centroid, loudness, and noisiness, condensed to scalar values per unit [^1^]. More recent systems incorporate self-supervised audio embeddings (e.g., CLAP, MuQ-MuLan) that map natural language descriptions into a shared audio-text latent space, enabling semantic targets such as "bright, reedy attack" or "warm sustained strings" [^12^][^13^]. This progression—from spectral coefficients to perceptual descriptors to semantic embeddings—defines the evolving control vocabulary of the field.

The remainder of this report is structured as follows. Chapter 2 traces the historical lineage from Musique Concrète through CataRT. Chapter 3 examines unit selection algorithms, from Hunt and Black's Viterbi framework to modern Bayesian particle filters. Chapters 4 and 5 address real-time systems and the commercial landscape, respectively. Chapters 6 through 8 cover creative techniques, neural hybrid architectures, and emerging research frontiers. Developers may wish to read Chapters 2–4 sequentially; musicians and composers may find Chapters 6–8 most immediately applicable; researchers are encouraged to consult the full sequence.

---

## 2. Foundations and Historical Lineage

### 2.1 Analog Precursors: Musique Concrète and Tape Splicing

The conceptual foundation of concatenative synthesis—building new sounds by assembling fragments of existing recordings—predates digital computation by more than two decades. On October 5, 1948, Pierre Schaeffer broadcast the "Concert de bruits" from the Studio d'Essai at RTF Paris, presenting *Étude aux chemins de fer* and four other noise studies composed from recorded "found sounds"[^1^]. Schaeffer termed this approach *musique concrète* to signal a philosophical reversal: rather than notating abstract musical ideas for instrumental realization, the composer began with concrete recorded sound and "abstracted the musical values it potentially contained"[^2^]. This shift—from notation-first to recording-first—established the epistemological precedent for all corpus-based synthesis: the sonic material itself serves as the primary compositional resource.

In 1951, Schaeffer, Pierre Henry, and engineer Jacques Poullin founded the Groupe de Recherche de Musique Concrète (GRMC) and developed dedicated tape-manipulation hardware: the morphophone (ten-head delay/loop machine), the phonogène (keyboard-controlled variable-speed tape replay), and a three-track tape recorder[^3^]. These instruments represent the first purpose-built concatenative devices—physical embodiments of unit selection, where discrete tape segments were chosen, reordered, and joined to construct new sequences. The morphophone's multiple playback heads anticipated the later digital concept of selecting from overlapping segment candidates.

Schaeffer formalized this practice in the *Traité des objets musicaux* (1966), introducing the *objet sonore*—the sound object—as a perceptual unit freed from causal origin through acousmatic listening[^805^]. Defined by intrinsic morphological properties (attack, sustain, spectral envelope, temporal evolution) rather than by source identity, the sound object directly prefigures the descriptor-based unit definitions of modern corpus-based synthesis[^29^].

In 1947, Dennis Gabor proposed that sounds could be represented as elementary "grains" or "acoustical quanta"—short pulses containing both temporal and frequency information[^5^]. Iannis Xenakis extended this into compositional practice with *Analogique A-B* (1959), realized by recording sine tones on analog tape, cutting them into thousands of pieces, and recombining via manual splicing according to stochastic scores[^4^]. Bernard Parmegiani executed the physical splicing—a procedure anticipating automated segmentation by four decades[^4^].

### 2.2 Digital Foundations: Phase Vocoder and STFT

The analog tape paradigm provided the conceptual model; digital signal processing provided the analytical infrastructure. The Short-Time Fourier Transform (STFT) and its musical application, the phase vocoder, created the spectral continuity necessary for seamless concatenation of heterogeneous units.

James L. Flanagan and Richard M. Golden introduced the phase vocoder at Bell Labs in 1966, representing speech by short-time phase and amplitude spectra and enabling independent time compression/expansion and pitch shifting[^9^]. The canonical STFT pipeline—segment, window, FFT, modify, inverse FFT, overlap-add—became the foundational DSP architecture for all subsequent concatenative systems[^10^]. Michael R. Portnoff demonstrated FFT-based digital implementation in 1976[^11^] and formalized time-frequency representation theory in 1980[^12^]. Ronald E. Crochiere's Weighted Overlap-Add (WOLA) established the constant-overlap-add constraint for artifact-free concatenation[^13^]; Griffin and Lim (1984) provided iterative phase reconstruction for magnitude-only pipelines[^14^]. Mark Dolson's 1986 *Computer Music Journal* tutorial translated these techniques for musicians[^15^], and Laroche and Dolson's 1999 scaled phase-locking addressed spectral "phasiness" in time-scale modification[^16^]. The phase vocoder thus served as transition infrastructure: spectral continuity between concatenated units via frequency-domain pitch and duration matching, smoothing joins that would otherwise produce transients at boundaries.

While spectral analysis tools matured in laboratories, the first digital concatenative instrument entered commercial production. The Fairlight CMI, developed by Kim Ryrie and Peter Vogel and released in 1979, pivoted from digital synthesis to digital recording of natural sounds[^6^]. The Fairlight's "Page R" sequencer (1982) enabled graphic pattern-based arrangement of sampled segments. At £12,000–£60,000, the Fairlight remained prohibitively expensive; the E-mu Emulator (1981), Ensoniq Mirage (1984, $1,695), and Akai S-series (from 1985) democratized sampling, normalizing the practice of segmenting and concatenating recorded audio[^8^].

### 2.3 Speech Synthesis Lineage and the Unit Selection Framework

The most rigorous formalization of concatenative selection emerged from text-to-speech (TTS) research, where intelligibility provided a quantifiable optimization target. Moulines and Charpentier's 1990 TD-PSOLA concatenated diphone units at pitch-synchronous boundaries marked by glottal closure instants, with Hanning windows extending two pitch periods for smooth spectral transitions[^17^][^18^].

The watershed advance came in 1996. Hunt and Black at ATR Japan proposed treating the synthesis database as a fully connected state transition network decoded by Viterbi search[^22^]. Their canonical dual-cost framework comprises: (1) a **target cost** measuring mismatch between target and candidate features, implemented as a weighted sum of $p = 20$–$30$ sub-costs; and (2) a **concatenation cost** estimating join quality, typically $q = 3$ sub-costs (cepstral distance, log power difference, pitch difference)[^22^][^24^]. Automated weight training via linear regression reduced training time by up to 100×[^23^], and pruned Viterbi with beam width 10–20 achieved near real-time selection on 100,000-unit databases[^22^].

This framework migrated to deployment through Festival (CSTR Edinburgh), an open-source diphone and unit-selection system[^47^]; CHATR (ATR/NICT), extending unit selection to emotional speech[^29^]; and MBROLA (TCTS Lab, Mons), a lightweight diphone engine. Together, these established the toolchain—segmentation, descriptor extraction, cost optimization, Viterbi decoding—that prefigured musical concatenative systems.

The speech-music divergence is critical to understanding the current field. Neural TTS (WaveNet 2016, Tacotron 2017, VALL-E 2023) has effectively replaced concatenative TTS for new voice-AI deployments[^107^]. Amazon Polly still offers Standard (concatenative) alongside Neural and Generative engines, but market trajectory favors neural approaches[^108^]. Yet concatenative synthesis retains advantages: Cohn and Zellou's Interspeech 2020 study demonstrated that listeners were less accurate at keyword identification for neural TTS than concatenative TTS in noise at $-3$ dB and $-6$ dB SNR[^124^]. Neural TTS reproduces casual speech reductions, improving naturalness but reducing intelligibility in adverse conditions; concatenative TTS produces hyper-articulated "clear speech"[^124^].

**Insight 1: The Speech-Music Inversion.** Speech synthesis and musical synthesis are diverging in opposite directions. Speech moved from concatenative to neural because the target is well-defined (intelligible, natural-sounding speech). Music synthesis has no such single target—musicians want idiosyncrasy, timbral identity, and surprise. Neural generative models produce plausible but generic music. Researchers now use concatenative methods to *constrain* neural generation to specific timbres (CoSaRef, kNN-SVC). Speech went neural to escape corpus limitations; music is returning to corpuses to escape neural genericism.

### 2.4 The IRCAM School: From Caterpillar to CataRT

The adaptation of speech synthesis unit selection to musical sound—heterogeneous corpora, perceptual descriptors, real-time interaction—was accomplished primarily by Diemo Schwarz at IRCAM in Paris, establishing the IRCAM school of corpus-based concatenative synthesis.

**Caterpillar (2000–2004).** Schwarz introduced data-driven concatenative sound synthesis at DAFx-2000 with the Caterpillar system, developed during his PhD at Université Paris 6[^29^][^32^]. Caterpillar performed offline Viterbi path-search for musical unit selection from large heterogeneous databases, using Hunt and Black's dual-cost framework: target cost and concatenation cost[^29^]. For instrument corpora, units were segmented by automatic score alignment via Dynamic Time Warping (DTW) and Hidden Markov Models (HMM)[^32^]; for free sounds, blind segmentation was applied. Descriptors included MPEG-7 low-level descriptors plus pitch, brilliance, noisiness, and spectral flux[^29^].

**Schwarz PhD Thesis (2004).** The dissertation *Data-Driven Concatenative Sound Synthesis* provided the field's theoretical foundation, establishing automatic alignment as feasible for building musical unit databases at scale[^32^]. The thesis demonstrated that corpus-based synthesis achieves naturalness by using actual recordings—"it is very difficult to build a model that would preserve all the fine details of sound"[^52^].

**CataRT (2006).** The critical architectural shift came with CataRT, released at DAFx-2006 as Max/MSP patches using the FTM library and Gabor framework[^29^][^30^]. CataRT abandoned Caterpillar's globally optimal Viterbi search in favor of real-time **greedy nearest-neighbor selection**: "Because of the real-time orientation of CataRT, we cannot use the globally optimal path-search style unit selection based on dynamic programming, but use a greedy nearest-neighbour selection"[^29^].

The CataRT model organizes units in a multi-dimensional descriptor space. The user controls a target point in a 2D projection, and the algorithm retrieves nearest units using Mahalanobis distance (Euclidean distance normalized over the corpus) to avoid distortions between descriptors with different ranges[^30^]. CataRT computes descriptors including fundamental frequency (YIN), aperiodicity, loudness, spectral centroid, flatness, sharpness, and MPEG-7 descriptors, condensing time-varying values to scalar characteristics per unit[^30^].

The FTM/Gabor infrastructure enabled this architecture. The Gabor sub-library—named explicitly after Dennis Gabor's "acoustical quanta"[^34^]—provides a unified framework for granular synthesis, PSOLA, phase vocoder, additive synthesis, and STFT techniques, processing "atomic sound particles" at arbitrary rates within Max's event processing model[^33^].

**Formalization and Canonization (2006–2007).** Schwarz's 2006 survey "Concatenative Sound Synthesis: The Early Years" in *Journal of New Music Research* provided the canonical historical review, documenting Caterpillar, Musical Mosaicing, Mosievius, Audio Analogies, and MATConcat[^31^]. The 2007 IEEE *Signal Processing Magazine* article "Corpus-Based Concatenative Synthesis" formalized the field for the broader signal processing community, establishing "corpus-based concatenative synthesis" (CBCS) as the standard term.

### 2.5 Adjacent Fields and Conceptual Boundaries

Three adjacent fields share technical infrastructure with concatenative synthesis while differing in objectives and methods: audio mosaicing, sound texture synthesis, and granular synthesis.

**Audio mosaicing** reformulates concatenative synthesis as resynthesis of a target sound by tiling with corpus units. Zils and Pachet's "Musical Mosaicing" (2001) at Sony CSL Paris treated unit selection as a constraint satisfaction problem (CSP), scaling to 100,000+ samples via adaptive local search[^35^]. Aucouturier and Pachet's Ringomatic (2005) adapted mosaicing to real-time drum accompaniment using four descriptors (energy, onset density, drum presence, cymbal presence)[^37^]. Mosaicing systems optimize for global target similarity rather than interactive descriptor-space exploration—a complementary objective to CataRT's navigational paradigm.

**Sound texture synthesis** pursues statistical resynthesis rather than unit concatenation. McDermott and Simoncelli (2011) demonstrated that textures—rain, fire, applause—can be resynthesized from time-averaged statistics of an auditory model (cochlear filters, envelope extraction, modulation filters)[^804^]. Synthesis quality improved as marginal moments, cross-channel correlations, and modulation power were added[^804^]. Unlike concatenative synthesis, which preserves specific timbral identity, texture synthesis generates novel signals matching only statistical properties—a non-concatenative alternative for homogeneous textures.

**Granular synthesis** occupies the closest technical proximity. Curtis Roads implemented the first computer-based granular synthesis in 1974 at UCSD using Music V; his 1981 MIT experiments conducted the first granular sampling from recorded files[^39^]. Barry Truax achieved the first real-time granular synthesis in 1986 on the DMX-1000, with his composition *Riverrun* realized entirely in real time[^40^]. Roads' 2001 book *Microsound* (MIT Press) remains the definitive theoretical survey[^201^].

Schwarz positions corpus-based concatenative synthesis as "a natural extension of granular synthesis, augmented by content-based selection and control"[^41^]. Granular synthesis selects by temporal position within a single file, with arbitrary unit sizes and no pre-analysis[^41^]. Concatenative synthesis adds: (1) multi-source heterogeneous corpora, (2) automated segmentation and descriptor analysis, and (3) content-based selection in a formalized descriptor space[^41^]. As grain durations extend toward tenths of a second, the perceptual boundary between granular texture and concatenative sampling blurs—a continuum now dissolving further with neural latent-space methods[^203^].

---

**Table 2.1: Chronology of Key Developments in Concatenative Synthesis (1947–2024)**

| Year | Development | Domain | Significance |
|------|-------------|--------|------------|
| 1947 | Gabor: "Acoustical quanta" theory[^5^] | Theory | Foundation for time-frequency grain representation |
| 1948 | Schaeffer: *Musique concrète*, "Concert de bruits"[^1^] | Analog | First composition from recorded sound fragments |
| 1951 | GRMC: morphophone, phonogène, 3-track recorder[^3^] | Analog | First dedicated concatenative hardware instruments |
| 1959 | Xenakis: *Analogique A-B* (manual tape splicing)[^4^] | Analog | First granular composition; stochastic unit assembly |
| 1966 | Flanagan & Golden: phase vocoder (Bell Labs)[^9^] | DSP | STFT analysis/synthesis for spectral continuity |
| 1976 | Portnoff: FFT-based digital phase vocoder[^11^] | DSP | Computational feasibility for real-time systems |
| 1979 | Fairlight CMI: first digital sampling instrument[^6^] | Commercial | Recorded segments as compositional building blocks |
| 1986 | Truax: first real-time granular synthesis[^40^] | Digital | Interactive grain-based performance |
| 1990 | Moulines & Charpentier: TD-PSOLA[^17^] | Speech | Pitch-synchronous diphone concatenation |
| 1996 | Hunt & Black: unit selection framework[^22^] | Speech | Dual-cost Viterbi: target cost + concatenation cost |
| 2000 | Schwarz: Caterpillar at IRCAM[^29^] | Music | Offline Viterbi musical unit selection |
| 2001 | Zils & Pachet: Musical Mosaicing (CSP)[^35^] | Music | Constraint-satisfaction unit selection |
| 2004 | Schwarz PhD: *Data-Driven CBCS*[^32^] | Music | Theoretical foundation; automatic score alignment |
| 2006 | Schwarz: CataRT (real-time CBCS)[^29^] | Music | Greedy nearest-neighbor; Max/MSP implementation |
| 2006 | Schwarz: "Concatenative Sound Synthesis: The Early Years"[^31^] | Survey | Canonical historical review (JNMR) |
| 2016 | DeepMind: WaveNet neural TTS[^107^] | Speech | Neural raw-waveform generation surpasses concatenative |
| 2024 | Tralie & Cantil: The Concatenator (Bayesian real-time) | Music | Probabilistic unit selection; commercial plugin debut |
| 2024 | IRCAM: Somax2 (machine-learned co-improvisation)[^49^] | Music | ML-guided corpus navigation retaining concatenative rendering |

The timeline reveals two parallel threads. The speech thread progressed from diphones (1990) through unit selection (1996) to neural TTS (2016), prioritizing intelligibility via ever-larger corpora. The musical thread progressed from analog tape (1948) through digital sampling (1979) and granular synthesis (1974–1986) to descriptor-based corpus navigation (2000–2006), prioritizing interactivity and timbral exploration. These divergent optimizations explain why the fields evolved distinct communities with different conferences, evaluation criteria, and opposite trajectories regarding neural versus corpus-based methods.

**Table 2.2: Key Concatenative and Precursor Systems**

| System | Institution | Year | Selection Method | Corpus Size | Real-Time | Status |
|--------|-------------|------|------------------|-------------|-----------|--------|
| GRMC (morphophone/phonogène) | RTF Paris | 1951 | Manual tape splicing | N/A | No | Historical |
| Fairlight CMI | Fairlight | 1979 | Manual pattern sequencing | ~8 MB | No (sequenced) | Historical |
| TD-PSOLA (diphone) | CNET France | 1990 | Diphone inventory | ~400 diphones | Yes | Historical |
| Festival | CSTR Edinburgh | 1998+ | Diphone + unit selection | Voice-dependent | Yes | Open-source active |
| CHATR | ATR Japan | 1996+ | Unit selection (Viterbi) | 100,000 units | Near | Research |
| Caterpillar | IRCAM | 2000 | Viterbi path-search | Instrument corpora | No | Research |
| Musical Mosaicing | Sony CSL | 2001 | Constraint satisfaction | 100,000+ samples | No | Research |
| CataRT | IRCAM | 2006 | Greedy nearest-neighbor | Heterogeneous, open | Yes | Open-source (GPL) |
| The Concatenator | DataMind Audio | 2024 | Bayesian particle filter | User-provided | Yes | Commercial ($149) |
| Somax2 | IRCAM | 2024 | ML-guided similar to CBCS | Musical corpora | Yes | Research/Max |

The systems table illustrates the central trade-off shaping the field: global optimality versus real-time interactivity. Offline systems (Caterpillar, Musical Mosaicing) apply Viterbi or constraint satisfaction for globally optimal sequences but require pre-computed targets. Real-time systems (CataRT, The Concatenator, Somax2) sacrifice global optimality for interactivity, using greedy or probabilistic selection. The speech community largely accepted this trade-off by moving to neural generation; the musical community continues exploring the design space, with recent hybrid approaches (neural embeddings for target costs, concatenative rendering) attempting to preserve both qualities.

![Figure 2.1: Chronology of Concatenative Synthesis Foundations (1947–2024)](/mnt/agents/output/fig_2_1_timeline.png)

*Figure 2.1.* Timeline of concatenative synthesis foundations, color-coded by domain. Two developmental threads—speech processing and musical composition—converge in the modern hybrid period. Source: Synthesized from Dim01, Dim06, and Dim11 research reports.

---

## 3. The Algorithmic Core: Descriptors, Selection, and Search

### 3.1 Audio Feature Extraction and Descriptor Sets

The operational foundation of concatenative synthesis is the transformation of raw audio into compact, comparable representations. Every unit must be reduced to a descriptor vector, and the choice of descriptors determines both the computational cost of search and the perceptual dimensions available for navigation.

#### 3.1.1 Classical Acoustic Descriptors

The canonical low-level descriptors derive from the STFT. The **spectral centroid** measures the balancing point of spectral power, correlating strongly ($r = .94$) with perceived brightness [^20^]. **Spectral rolloff** identifies the frequency below which 95% of spectral energy accumulates. **Spectral flux** quantifies frame-to-frame magnitude difference via the 2-norm. **Spectral flatness** measures the ratio of geometric to arithmetic mean, distinguishing tonal from noise-like content. **Zero-crossing rate** and **RMS energy** provide inexpensive temporal features; the **temporal centroid** locates the energy center of gravity within a unit. Frame-based features are condensed—by mean, median, slope, or standard deviation—to scalar characteristics per unit.

#### 3.1.2 MFCC and Cepstral Representations

**Mel-Frequency Cepstral Coefficients (MFCCs)** are the dominant compact descriptor family in audio retrieval. The standard implementation extracts 13 coefficients via FFT with a window size of 1{,}024 samples and hop size of 512 samples, applying a Mel-scale filterbank and discrete cosine transform [^17^]. Originally developed for speech recognition, MFCCs compress the spectral envelope while discarding fine harmonic structure. Comparative studies found that MFCCs outperform MPEG-7 descriptors for classification tasks while demanding less computation [^28^].

#### 3.1.3 Perceptual Descriptors

Perceptual descriptors quantify subjective auditory dimensions. **Loudness** is calculated according to Zwicker's ISO 532-B model, accounting for specific loudness across critical bands and temporal masking [^30^]. **Sharpness**, defined by Von Bismarck and refined by Aures and Fastl-Zwicker, weights specific loudness by a frequency-dependent function $g(z)$ on the Bark scale, yielding a metric in acum units [^31^]. **Roughness** quantifies amplitude modulation of spectral components, while **inharmonicity** measures deviation of partial frequencies from integer multiples of the fundamental. These descriptors are computed in IRCAM's ECRINS environment and imported into CataRT, enabling navigation by verbally meaningful dimensions.

#### 3.1.4 MPEG-7 Standardized Descriptors and SDIF Interchange

The MPEG-7 multimedia description interface provided the first systematic standardization of audio content descriptors [^18^]. MPEG-7 audio spans temporal (RMS envelope, zero-crossing rate, temporal centroid), spectral (centroid, spread, flatness, rolloff, flux), cepstral (MFCC), perceptual (sharpness), and specific domains (odd-to-even harmonic ratio, harmonic-to-noise ratio, attack time). Schwarz's Caterpillar system adopted MPEG-7 as its base descriptor set, condensing time-varying low-level descriptors to unit-level scalars by modeling temporal evolution via mean, slope, and spectrum [^32^].

The **Sound Description Interchange Format (SDIF)**, jointly defined by IRCAM, CNMAT, and UPF and adopted in 1996–97, provides the binary transport layer [^33^]. SDIF stores spectral representations, sinusoidal models, and higher-level descriptors in an extensible, self-describing frame structure. Burred et al. extended SDIF for general audio features at ISMIR 2008 [^34^].

#### 3.1.5 The Timbre Toolbox and the Perceptual-Mathematical Gap

The **Timbre Toolbox**, published by Peeters et al. in *JASA* in 2011, extracts over 160 features organized into ten classes, derived from STFT, harmonic sinusoidal analysis, an auditory ERB model, and the temporal energy envelope [^19^]. It also exposed a persistent limitation: verbal descriptors such as "bright," "rough," and "warm" map only partially onto mathematical features. McAdams noted that non-linear models (Random Forest) predict semantic ratings better than linear regression, with harmonic-to-noise ratio the most important predictor for "raspy/grainy/rough" judgments [^36^]. This perceptual-mathematical gap constrains musical expressivity: performers request "warmer" sounds, but the system navigates by centroid and spread.

**Table 3.1: Descriptor Classes for Concatenative Synthesis**

| Class | Representative Descriptors | Signal Domain | Perceptual Correlates | Computational Cost |
|-------|---------------------------|---------------|----------------------|-------------------|
| Temporal | ZCR, RMS energy, temporal centroid | Time domain | Rhythmic activity, intensity | Low |
| Spectral shape | Centroid, rolloff, flux, flatness, spread | STFT magnitude | Brightness, noisiness, onset sharpness | Low–Medium |
| Cepstral | MFCC (13 coefficients) | Mel-warped log spectrum | Timbre identity, vocal quality | Medium |
| Perceptual (Zwicker) | Loudness, sharpness, roughness | Critical-band loudness pattern | Subjective intensity, cutting quality, dissonance | Medium–High |
| Harmonic | Pitch, inharmonicity, HNR, odd/even ratio | Sinusoidal model | Tonalness, noisiness | High |
| MPEG-7 standardized | 17 low-level audio descriptors | Mixed | Standardized interoperability | Medium |
| Timbre Toolbox | 160+ features (10 classes) | STFT, ERB, harmonic, TEE | Comprehensive timbre characterization | High |
| Deep embeddings | CLAP (512-dim), MERT, OpenL3 | Neural network latent space | Semantic similarity, text-to-audio | Very High (inference) |

The table reveals a progression from computationally efficient classical descriptors to perceptually grounded features, culminating in deep embeddings that capture semantic relationships at the expense of interpretability and real-time latency. The choice of descriptor class constrains the navigational vocabulary available to performers.

### 3.2 Feature Spaces and Distance Metrics

Once descriptors are extracted, units become points in a $D$-dimensional feature space. The geometry of this space determines the user's experience of corpus navigation.

#### 3.2.1 Canonical Timbre Dimensions from MDS Studies

The perceptual grounding of descriptor choice traces to multidimensional scaling (MDS) studies. Grey (1975) derived a three-dimensional timbre space characterized by attack time, spectral centroid, and spectral flux [^20^]. Wessel (1979) extended this into a musical control structure, arguing that spectral energy distribution corresponds to brightness and onset transient character to articulation [^37^]. McAdams et al. (1995) quantified acoustic correlates: the first dimension correlated at $r = .94$ with the logarithm of rise time, the second at $r = .94$ with spectral centroid, and the third at $r = .85$ with spectral irregularity [^20^]. These three dimensions have become the canonical basis for descriptor selection.

#### 3.2.2 Euclidean, Manhattan, and Cosine Distances

The simplest metrics are the $L_2$ (Euclidean) norm, $L_1$ (Manhattan) norm, and cosine distance. All three suffer from a common limitation: when applied to unnormalized feature vectors, descriptors with large numerical ranges (e.g., spectral centroid in Hz) dominate over descriptors with small ranges (e.g., spectral flatness near unity), distorting the perceptual geometry of the space.

#### 3.2.3 Mahalanobis Distance as Canonical Normalization

CataRT addresses range distortion via **Mahalanobis distance**, normalizing each descriptor by its standard deviation over the corpus [^21^]. For a descriptor space of dimension $D$ with $N$ units, let $\mu$ denote the $N \times D$ matrix of unit data and $\sigma$ the per-descriptor standard deviations. The squared distance $d$ between target position $x$ and all units is:

$$
d = \frac{(x - \mu)^2}{\sigma}
$$

Either the unit with minimal $d$ is selected, or one is chosen randomly from units satisfying $d < r^2$ for a radius threshold $r$ [^35^]. Caterpillar used a related approach: weighted Euclidean distance normalized by division by the standard deviation [^38^].

#### 3.2.4 Dimensionality Reduction for Visualization and Search Acceleration

Because navigating a $D$-dimensional space is impractical for interactive performance, descriptor spaces are reduced to 2D projections. **PCA** maximizes variance along orthogonal axes; Freesound's AudioClas engine computes ~170 descriptors and projects them onto two principal components for navigable sound maps [^39^]. **t-SNE** preserves local neighborhoods but requires ~45 minutes for large corpora [^40^]. **UMAP** achieves comparable preservation with computation times reduced to minutes [^40^]. PCA-based branch-and-bound accelerates nearest-neighbor search by splitting descriptor space along principal component vectors [^41^].

### 3.3 Unit Selection Algorithms

Unit selection is the combinatorial heart of concatenative synthesis: given a target specification, the algorithm must choose corpus units optimizing fidelity to the target while maintaining perceptually smooth transitions.

#### 3.3.1 Target Cost and Concatenation Cost: The Hunt & Black Framework

The canonical formalization was established by Hunt and Black (1996) on the CHATR speech synthesis system [^42^]. They treated the synthesis database as a fully connected state transition network, where state occupancy costs represent target mismatch and transition costs represent join quality.

**Target cost** measures the dissimilarity between target specification $t_i$ and candidate unit $u_i$, computed as the weighted sum of $p$ target sub-costs $C_j^t(t_i, u_i)$:

$$
C^t(t_i, u_i) = \sum_{j=1}^{p} w_j^t \, C_j^t(t_i, u_i)
$$

In Hunt and Black's implementation, $p$ varied between 20 and 30 sub-costs encompassing phonetic identity, prosodic context, pitch, duration, and power [^42^]. For musical synthesis, sub-costs typically include descriptor distances, pitch deviation, and loudness mismatch.

**Concatenation cost** estimates the quality of joining unit $u_{i-1}$ to unit $u_i$, computed as the weighted sum of $q$ concatenation sub-costs $C_j^c(u_{i-1}, u_i)$:

$$
C^c(u_{i-1}, u_i) = \sum_{j=1}^{q} w_j^c \, C_j^c(u_{i-1}, u_i)
$$

Hunt and Black used $q = 3$ sub-costs: cepstral distance at the concatenation point, absolute difference in log power, and absolute difference in pitch [^42^]. When $u_{i-1}$ and $u_i$ are consecutive units in the original database recording, their concatenation cost is zero, encouraging "non-uniform unit selection" that prefers naturally contiguous sequences.

The **total cost** for a sequence of $n$ units, including start and end transitions to silence ($S$), is:

$$
C(t_1^n, u_1^n) = \sum_{i=1}^{n} C^t(t_i, u_i) + \sum_{i=2}^{n} C^c(u_{i-1}, u_i) + C^c(S, u_1) + C^c(u_n, S)
$$

Expanding to the sub-cost level yields the full joint optimization:

$$
C(t_1^n, u_1^n) = \sum_{i=1}^{n} \sum_{j=1}^{p} w_j^t \, C_j^t(t_i, u_i) + \sum_{i=2}^{n} \sum_{j=1}^{q} w_j^c \, C_j^c(u_{i-1}, u_i) + C^c(S, u_1) + C^c(u_n, S)
$$

The optimal sequence $\bar{u}_1^n$ minimizes this total cost:

$$
\bar{u}_1^n = \arg\min_{u_1, \ldots, u_n} C(t_1^n, u_1^n)
$$

Hunt and Black trained cost weights via linear regression on perceptual data, finding that regression-based estimation reduced training time by approximately 100× compared to weight-space grid search, with negligible difference in output quality [^22^].

#### 3.3.2 Dynamic Programming and Pruned Viterbi Search

The minimization over $n$ units with $m$ candidates per target is a shortest-path problem on a fully connected trellis. The **Viterbi algorithm** solves this via dynamic programming in $O(n \cdot m^2)$ time. For speech databases of 100{,}000 units, Hunt and Black achieved near real-time performance with beam-width pruning of 10–20 candidates per frame [^42^]. Schwarz's Caterpillar adapted this framework to music, using Viterbi path-search with weighted Euclidean distance on MPEG-7 descriptors [^38^]. Coleman (2015) compared five mosaicing algorithms, finding that dynamic programming improved continuity but at substantially higher computational cost than greedy selection [^43^]. The tension persists: Viterbi provides global optimality but requires $O(m^2)$ operations per frame; real-time systems typically abandon it.

#### 3.3.3 Constraint Satisfaction

An alternative to cost minimization treats unit selection as a **constraint satisfaction problem (CSP)**. Zils and Pachet's Musical Mosaicing (2001) introduced CSP for generating audio sequences with constraints on sample metadata [^44^]. Aucouturier and Pachet's Ringomatic (2005) demonstrated real-time drum accompaniment via adaptive local search over four descriptors [^45^]. CSP permits declarative musical rules: avoiding unit repetition, enforcing temporal ordering, or excluding specific corpora. The adaptive local search algorithm iteratively adjusts selection until constraints are satisfied, trading global optimality for flexible rule-based control [^46^].

#### 3.3.4 Probabilistic Methods: Bayesian Particle Filtering

The Concatenator (Tralie & Cantil, ISMIR 2024) treats corpus window indices as hidden states in a Bayesian state-space model and uses a **particle filter** for sequential inference [^23^]. The target audio stream serves as an observation; $P$ particles each represent $p$ corpus windows, and the posterior is updated via importance sampling with a KL-divergence observation model. The complexity is $O(Pp)$, independent of corpus size [^27^]. Unlike neural systems, the particle filter requires no training and adapts to arbitrary corpora at runtime.

#### 3.3.5 Distance Mapping and Warping Functions

Schwarz (SMC 2011) extended the distance function to integrate musical constraints without sacrificing kd-tree efficiency [^24^]. A warping function modifies distance calculation to penalize recently played units or favor specific corpora. Because the warping is applied as a functional mapping of the distance metric, efficient branch-and-bound kd-tree search remains applicable "with only little loss of efficiency" [^24^]. The formulation permits smooth interpolation between solution spaces, enabling performers to crossfade from one constraint set to another in real time.

### 3.4 Search Data Structures for Large Corpora

As corpora grow from hundreds to millions of units, exhaustive linear search becomes prohibitive. The search data structure determines whether concatenative synthesis remains interactive at scale.

#### 3.4.1 K-d Trees and Vantage Point Trees

**K-d trees** partition descriptor space recursively along axis-aligned hyperplanes. CataRT's implementation splits along hyperplanes perpendicular to principal component vectors, achieving maximal separation at each level [^41^]. At query time, branch-and-bound eliminates approximately half the candidate space with a single distance comparison. For exact nearest-neighbor search, k-d trees provide $O(\log N)$ average-case complexity, though performance degrades toward $O(N)$ as $D$ exceeds 20 dimensions—the curse of dimensionality. **Vantage point trees** offer spherical partitioning, sometimes outperforming k-d trees for non-uniform metric spaces.

#### 3.4.2 Approximate Nearest Neighbor: LSH and HNSW Graphs

**Approximate nearest neighbor (ANN)** methods trade a small accuracy loss for speed. **Locality-Sensitive Hashing (LSH)** maps similar vectors to the same hash buckets with high probability. Barnett et al. employ MinHash LSH to enable millisecond-scale retrieval over 5 million embeddings [^26^]. **Hierarchical Navigable Small World (HNSW)** graphs construct a layered navigable graph where each layer is a subset of the previous, enabling greedy zoom-in traversal [^48^]. HNSW achieves near-exact recall with query times in the millisecond range for million-vector datasets.

#### 3.4.3 Filter-and-Refine Methods

Schnitzer, Flexer, and Widmer (ISMIR 2009) introduced a **filter-and-refine** approach for accelerating Kullback-Leibler divergence search in Gaussian timbre models [^25^]. The method rescales the KL divergence and uses a modified FastMap implementation. On million-track datasets, the approach accelerated search by 10–30× compared to linear scan while maintaining 95–99% recall [^25^].

#### 3.4.4 Vector Databases for Million-Scale Corpus Search

Modern vector databases bring billion-scale ANN infrastructure to audio. **FAISS** (Facebook AI Similarity Search) implements IVF, HNSW, and product quantization for billion-vector datasets with GPU acceleration [^48^]. Barnett et al. store 5 million music embeddings in Pinecone, employing HNSW indexing; queries return top-$k$ results in milliseconds [^26^]. These systems could replace handcrafted kd-trees when corpora exceed hundred-thousand-unit scales, though latency (10–50 ms at p95) may constrain real-time musical applications.

#### 3.4.5 Corpus-Size-Independent Complexity

The Concatenator's particle filter achieves independence from corpus size not through indexing but through probabilistic state-space filtering [^27^]. Each particle maintains a belief distribution over a fixed number of corpus windows; complexity is $O(Pp)$, determined by inference parameters rather than data volume. For corpora of hours-long duration, this represents a qualitative departure from indexing-based approaches.

**Table 3.2: Search Data Structures for Concatenative Synthesis**

| Structure | Search Type | Complexity | Recall | Scales To | Index Build | Best For |
|-----------|-------------|-----------|--------|-----------|-------------|----------|
| Linear scan | Exact | $O(N)$ | 100% | $10^3$ units | None | Small corpora, prototyping |
| K-d tree (PCA-split) | Exact | $O(\log N)$ avg. | 100% | $10^4$–$10^5$ units | $O(N \log N)$ | Real-time exact NN in moderate dimensions [^41^] |
| VP-tree | Exact | $O(\log N)$ avg. | 100% | $10^4$–$10^5$ units | $O(N \log N)$ | Non-uniform metric spaces |
| LSH (MinHash) | Approximate | $O(1)$ lookup | 85–95% | $10^6$–$10^7$ vectors | $O(N)$ | Very large corpora, tunable precision [^26^] |
| HNSW graph | Approximate | $O(\log N)$ | 95–99%+ | $10^6$–$10^9$ vectors | Hours at billion scale | High-recall interactive search [^48^] |
| Filter-and-refine (KL) | Approximate | 10–30× faster than linear | 95–99% | $10^6$ tracks | Moderate | Complex probabilistic distances [^25^] |
| Particle filter | Probabilistic | $O(Pp)$ (corpus-independent) | N/A (posterior) | Unlimited | None | Real-time, untrained, arbitrary corpora [^27^] |
| Vector database (FAISS/Pinecone) | Approximate | 10–50 ms p95 | 95–99% | $10^9$ vectors | Hours | Production deployment at scale [^26^] [^48^] |

The table exposes a fundamental architectural choice. Exact structures guarantee correct retrieval but degrade as dimensionality and corpus size grow. Approximate structures scale to millions or billions with tunable recall but introduce latency and memory overhead. The particle filter occupies a unique position: by reformulating search as probabilistic inference rather than database lookup, it eliminates corpus-size dependency entirely, though at the cost of stochastic selection.

### 3.5 Transition Handling and Concatenation Artifacts

Even optimal unit selection produces audible artifacts if boundaries are not smoothed. The transition layer determines whether the assembled sequence sounds continuous or disconnected.

#### 3.5.1 Crossfade Strategies

The simplest transition applies a windowed crossfade at unit boundaries. **Hann** windows provide smooth tapering with zero amplitude at edges; **Hamming** windows reduce side-lobe leakage; **Blackman** windows offer further side-lobe suppression. Overlap length trades responsiveness against smoothness: shorter overlaps (5–20 ms) preserve transient precision but may produce clicks; longer overlaps (50–200 ms) smooth spectral discontinuities but blur transients. For percussive corpora, short asymmetric crossfades may be preferable.

#### 3.5.2 Phase Vocoder-Based Transition Smoothing

For transitions requiring pitch or duration matching, the **phase vocoder** provides spectral continuity via STFT overlap-add with phase-locked resynthesis. Laroche and Dolson's 1999 scaled phase-locking preserves vertical phase coherence across adjacent frequency bins, eliminating "phasiness" artifacts [^49^]. When concatenating units with different fundamentals, the phase vocoder transposes the source to match the target pitch before overlap-add. IRCAM's SuperVP implements these techniques for high-quality concatenative transitions [^50^].

#### 3.5.3 Perceptual Continuity Metrics and the Absence of Benchmarks

Despite decades of research, no standardized benchmark exists for concatenation quality. Speech synthesis employs Mel-Cepstral Distortion (MCD) and Mean Opinion Score (MOS), but musical concatenative synthesis lacks equivalent standards. Researchers typically rely on spectral distortion measures as proxies for perceptual discontinuity, yet these correlate imperfectly with listener judgments. Coleman's thesis confirmed that spectral join costs "do not correlate sufficiently with human perception" [^51^]. The absence of a standardized benchmark—encompassing corpus diversity, descriptor sets, transition types, and perceptual evaluation protocols—remains a methodological gap impeding comparative assessment.

---

## 4. Real-Time Systems and Software Architectures

The algorithmic foundations from Chapter 3—descriptor extraction, distance metrics, unit selection, and search structures—are necessary but not sufficient for musical practice. A concatenative synthesizer must realize those algorithms within hard real-time constraints while remaining responsive to gestural input and robust across hours-long performances. This chapter examines the engineering decisions that transform theory into playable instruments, from IRCAM's research patches to contemporary commercial plugins.

### 4.1 Latency, Throughput, and Real-Time Constraints

#### 4.1.1 Defining Real-Time for Interactive Music

The perceptual thresholds for digital musical instrument latency have been quantified across multiple empirical studies. Wessel and Wright's foundational 2002 recommendation that digital instruments should aim for action-to-sound latency below 10 ms remains the most widely cited benchmark [^250^]. Subsequent research refines this by context: percussive interactions exhibit natural variation around 4 ms, with asynchronies of 6 ms detectable by listeners [^251^]; continuous gestural control tolerates 20–30 ms [^251^]; networked ensemble playing accepts up to 50 ms, though synchronization degrades above 30 ms [^252^]. Schmid et al. (2024, n=37) found mean just-noticeable-difference for audio latency of 49 ms at 0 ms base latency, improving to 27 ms at 64 ms base latency [^250^].

For concatenative synthesis, these thresholds partition the design space. Systems targeting tight rhythmic interaction must maintain end-to-end latency below 10 ms, inclusive of buffering, analysis, search, and grain scheduling. Gestural navigation tolerates 20–30 ms, while ambient applications may accept 50 ms. Rodrigo Constanzo's C-C-Combine uses a 512-sample (~11.6 ms at 44.1 kHz) post-onset window with FluCoMa's `@blocking 2` scheduler-priority mode to balance descriptor accuracy against retrieval speed [^9^].

#### 4.1.2 CPU Load and Memory Management

Concatenative synthesis imposes a bimodal computational load: descriptor computation (analysis) and grain retrieval with overlap-add resynthesis (synthesis). In CataRT's architecture, analysis is performed once per corpus unit during ingestion, producing an (N,D) descriptor matrix that resides in RAM [^1^]. At performance time, the CPU cost shifts to nearest-neighbor search and grain scheduling. For corpora of 10^4–10^5 units, exact kd-tree search provides O(log N) average-case complexity, degrading toward O(N) as descriptor dimensionality exceeds 20 [^1^]. The synthesis thread must additionally perform windowed overlap-add, pitch transposition, and amplitude normalization without dropping audio callbacks.

Modern concatenative plugins—including DataMind Audio's Concatenator—load entire corpora into RAM, with the manufacturer stating that "the only limitation on how many samples can be loaded... is how much RAM is available," implying no disk-streaming architecture [^90^]. This eliminates disk-I/O jitter but bounds corpus size: a one-hour stereo corpus at 44.1 kHz/16-bit occupies ~635 MB uncompressed, and with descriptors and search indices, practical limits emerge around 4–16 GB.

#### 4.1.3 Threading Models and Audio Callback Safety

Real-time audio systems must separate audio rendering (callback thread) from UI and analysis tasks (lower-priority threads), communicating via lock-free data structures to prevent priority inversion [^114^]. Concatenative synthesis adds the challenge that corpus queries—kd-tree traversals, SQLite lookups, or particle-filter updates—may exceed the audio callback budget. Strategies include pre-computing descriptors offline, deferring queries to worker threads, and using approximate nearest-neighbor methods that trade recall for predictable query time. The JUCE framework, used by Catecophony and many commercial plugins, provides built-in thread-safe parameter handling, but the developer remains responsible for guaranteeing no allocation or blocking on the audio thread [^142^].

A distinctive concept from live performance is the "shared symbolic instrument." When a laptop performer records an acoustic improviser in real time, segments the audio, extracts descriptors, and adds units to the corpus, both performers share the same sound space. As Schwarz describes it, the coupling "takes place in a concrete sound space, since the very timbral variation of the acoustic performer directly constitutes the instrument from which the digital performer creates music," a situation that "could even be seen as an improvisation with two brains and four hands controlling one shared symbolic instrument" [^61^]. The threading implications are substantial: the analysis thread must ingest, segment, and describe live audio without disrupting the synthesis thread's real-time guarantees.

### 4.2 The CataRT Ecosystem: Architecture and Data Flow

#### 4.2.1 Model-View-Controller Architecture

CataRT's architecture follows an explicit Model-View-Controller (MVC) pattern. The Model comprises the multidimensional descriptor space populated by sound units. The View provides two-dimensional projections of that space for performer navigation, typically using PCA or user-selected descriptor pairs. The Controller encompasses the selection algorithm, trigger modes, and gestural input mapping [^1^].

The data flow is: (1) audio input feeds the corpus via segmentation; (2) analysis extracts descriptors, populating an (N,D) matrix; (3) synthesis performs nearest-neighbor search, applies transformations, and concatenates grains via overlap-add. The distance measure is Euclidean distance normalized per-descriptor by the corpus standard deviation—i.e., Mahalanobis distance—to prevent range distortion [^1^]. Write access is centralized in `catart.data`; read access is via `catart.data.proxy`, enabling multiple synthesis modules to operate on shared corpora [^1^].

For persistent storage, CataRT wraps an SQLite relational database tracking soundfiles, segments, and descriptors, allowing corpora to be saved without re-analysis [^1^]. The 2D projection view has become the canonical interaction paradigm: performers navigate a visualized timbre space using XY controllers or graphics tablets, selecting regions that determine which units enter the synthesis stream.

#### 4.2.2 FTM and Gabor Libraries for Max/MSP

The underlying infrastructure for classic CataRT consists of three IRCAM libraries: FTM, Gabor, and MnM. FTM provides the `fmat` class for sample vectors, Fourier spectra, and descriptor frames, enabling matrix operations within Max's message-passing environment [^1^]. The Gabor library processes grains, wave periods, and STFT frames at arbitrary rates using Max's event processing model rather than block-wise MSP signal streaming [^88^]. By scheduling grains via messages, Gabor enables pitch-synchronous and granular synthesis within a unified modular framework, allowing descriptor-driven selection to operate at whatever temporal resolution the controller provides [^89^]. An overlap-add buffer reconstructs continuous audio from the resulting grain streams.

#### 4.2.3 CataRT-MuBu: The Modern Successor

CataRT-MuBu supersedes the classic FTM-based CataRT and is distributed freely through the Max Package Manager and IRCAM Forum [^120^]. It requires Max 7+ and the MuBu package. MuBu provides generic containers for multimodal data—audio, descriptors, motion, MIDI, markers—and includes PiPo for descriptor computation [^118^]. Replacing FTM's specialized matrices with MuBu's generic containers allows CataRT-MuBu to incorporate non-audio corpora alongside audio descriptors. CataRT-MuBu reached release 1.7.0 by September 2025 [^115^]. The MuBu package uses a proprietary "Forum" license, in contrast to FTM's LGPL [^95^].

#### 4.2.4 Live Corpus Building: The LAM 2006 Performance

CataRT's live corpus building capability was first demonstrated in concert at the Live Algorithms for Music (LAM) conference in 2006, featuring George Lewis on trombone and Evan Parker on saxophone improvising with CataRT [^145^]. The instrumental audio was recorded, segmented, and analyzed in real time, with the last several minutes retained in a rolling corpus from which the laptop performer selected units via a fader box, navigating the emergent descriptor space [^145^].

This performance exemplifies the "shared symbolic instrument": the corpus did not exist before the performance began; it was co-created by the acoustic improvisers and consumed by the digital performer. A second LAM 2006 performance, *Rien du tout* by Sam Britton and Diemo Schwarz, extended the principle to environmental sound, building a corpus from concert hall ambience and audience sounds [^145^].

### 4.3 Expanded Ecosystem: FluCoMa, Mosaïque, and New Tools

#### 4.3.1 FluCoMa: De Facto Standard Infrastructure

The Fluid Corpus Manipulation (FluCoMa) toolkit has become the de facto standard for corpus manipulation across Max, SuperCollider, and Pure Data [^70^]. Developed at the University of Huddersfield's CeReNeM from approximately 2017, with public release 1.0.0 in May 2020, it received ERC funding under Horizon 2020 (grant agreement No 725899) [^254^]. FluCoMa provides signal decomposition (slicing, HPSS, NMF, descriptors) and corpus exploration tools (datasets, KDTree, PCA, UMAP, MLP) [^176^], all with real-time and non-real-time variants [^148^].

For concatenative synthesis, FluCoMa's `FluidKDTree` enables k-nearest-neighbor lookup in real time, with the `@blocking 2` parameter placing Max object processing into the scheduler thread for lowest latency [^9^]. Buffer utilities allow descriptor data to flow through buffer-based pipelines [^176^]. Community ports including ReaCoMa (for REAPER) demonstrate ecosystem growth without central control [^177^].

#### 4.3.2 Mosaïque: Democratization for Non-Coders

Mosaïque, developed at LFO-lab (Université de Montréal), addresses the programming expertise barrier that has historically limited CBCS adoption. Available as a standalone Max patch and a Max for Live device (Ableton Live 11/12, Max 8.6.0+), it uses FluCoMa for all machine listening processes [^68^]. Its distinctive feature is a 3D environment for visualizing audio corpora, alongside MIDI, OSC, and algorithmic navigation tools [^11^]. Version 0.2 was published on Zenodo in August 2025 [^14^]. The project is funded by FRQSC and OICRM [^11^].

#### 4.3.3 AudioGuide and Symbolic Extensions

AudioGuide is a Python-based, non-real-time framework developed by Benjamin Hackbarth during his IRCAM residency (2010) [^64^]. It uses csound for rendering and supports output to Logic, Pro Tools, Reaper, and bach.roll. Being non-real-time, AudioGuide can layer sounds more densely than real-time systems and permits more flexible descriptor mapping [^72^]. Its subtractive spectral algorithm enables simultaneous selection of vertically stratified and horizontally overlapping corpus units, which real-time systems cannot achieve within callback constraints [^64^].

The dada library for Max extends CataRT's principles into the symbolic domain. Developed by Daniele Ghisi, it implements score segmentation and concatenative sequencing within Max's bach computer-aided composition environment [^56^], generating notated sequences of corpus-derived events rather than triggered grains [^91^].

#### 4.3.4 The 2024–2025 "Concatenative Renaissance"

The period 2024–2025 marks an inflection point in concatenative synthesis tooling. Table 4.1 compares ten current systems across platform, licensing, real-time capability, corpus access model, key algorithms, and distribution channel.

**Table 4.1: Concatenative Synthesis Systems—Comparative Overview**

| System | Platform | License/Cost | Real-Time | Corpus Access | Key Algorithms | Distribution |
|--------|----------|-------------|-----------|---------------|----------------|--------------|
| CataRT (classic) | Max/MSP + FTM/Gabor | GPL (free) | Yes | Pre-loaded + live recording | Mahalanobis NN, 2D projection | IRCAM [^1^] |
| CataRT-MuBu | Max + MuBu/PiPo | Forum (free) | Yes | Pre-loaded + live recording | PiPo descriptors, multimodal | Max Package Manager [^120^] |
| FluCoMa | Max/SC/Pd/CLI | Open-source | Yes/No variants | Dataset/KDTree | KDTree, PCA, UMAP, MLP | flucoma.org [^70^] |
| Mosaïque | Max for Live / standalone | Free (FRQSC funded) | Yes | 3D visualization + MIDI/OSC | FluCoMa-based | Zenodo, maxforlive.com [^14^] |
| C-C-Combine | Max/MSP | Free | Yes | Onset-triggered mosaicing | Loudness/pitch/centroid/flatness | rodrigoconstanzo.com [^8^] |
| Concatenator | VST/AU/AAX | $149 commercial | Yes | RAM-loaded corpus | Bayesian particle filter, ML matching | Native Instruments [^90^] |
| Catecophony | VST3/AU (JUCE) | Open-source (alpha) | Yes | k-d tree grain search | Essentia + FFTW3 descriptors | GitHub [^169^] |
| SKataRT | Max for Live | ~€200/year Forum | Yes | 8 sub-corpora, 16 channels | CataRT + mosaicing | IRCAM Forum [^172^] |
| AudioGuide | Python + csound | Open-source | No (offline) | Batch composition | Subtractive spectral, dense layering | GitHub [^72^] |

The table reveals three axes of differentiation: real-time versus offline, open-source versus commercial, and coder-centric versus non-coder accessibility. Only two systems (Concatenator, SKataRT) are commercial; every real-time system except Concatenator requires Max, SuperCollider, or Pure Data literacy, confirming that concatenative synthesis remains embedded in the creative-coding ecosystem.

### 4.4 Cross-Platform and Deployment Considerations

#### 4.4.1 Desktop Integration

The rarity of plugin-format concatenative synthesizers is striking. As of 2025, DataMind Audio's Concatenator ($149, VST/AU/AAX) is the only commercial plugin explicitly implementing real-time concatenative synthesis [^90^] [^2^]. Granular synthesis plugins abound—Output Portal ($149), Arturia Pigments (~$99–199), UVI Falcon ($349+), Spectrasonics Omnisphere ($479+)—but none employ descriptor-driven unit selection from heterogeneous corpora. Catecophony provides an open-source VST3/AU alternative (JUCE/Essentia) at alpha release [^169^]. SKataRT is a Max for Live device available through IRCAM Forum subscription (~€200/year), combining CataRT techniques with mosaicing [^172^].

The ISMIR 2024 Concatenator paper demonstrated real-time corpus-size-independent concatenative synthesis using a Bayesian particle filter [^179^]; the algorithm's Python prototype is open-source, while the VST wrapper is proprietary. DataMind Audio also markets the Combobulator (neural texture synthesis) and Refractalizer (granular synthesis), suggesting a portfolio strategy around AI-driven sound manipulation [^5^] [^6^].

#### 4.4.2 Embedded DSP and Hardware Constraints

No hardware instrument currently implements true descriptor-driven concatenative synthesis. The hardware granular synthesizer market has expanded—Waldorf Iridium/Quantum, 1010music lemondrop, Torso S-4, Intellijel Multigrain, Make Noise Morphagene, Qu-Bit Nebulae v2—but all are position-based granular engines [^34^]. Real-time descriptor extraction and nearest-neighbor search exceed typical embedded DSP capabilities, and hours-long corpora with per-unit descriptors exceed the 4–8 GB capacities of current hardware. The Qu-Bit Nebulae's open-source DSP platform could theoretically host a concatenative engine, but no such firmware exists [^34^].

#### 4.4.3 Web Audio and Browser-Based Architectures

Browser-based concatenative synthesis remains largely theoretical, though enabling infrastructure has matured. SuperSonic (2025) reworks SuperCollider's scsynth to run as a Web Audio AudioWorklet via WebAssembly, with full OSC compatibility and zero-allocation audio paths [^253^]. Because FluCoMa objects compile for SuperCollider, a SuperSonic-hosted concatenative synthesizer is technically feasible. Practical barriers remain: HTTP corpus streaming introduces unpredictable latency; Web Audio's 128-sample quantum imposes a ~3 ms lower bound; and persistent local storage for multi-gigabyte corpora is unavailable. For lightweight corpora, a WebAssembly-based engine using HNSW-indexed embeddings and AudioWorklet grain scheduling represents a plausible near-term architecture.

![Comparative Assessment of Concatenative Synthesis Systems](/mnt/agents/output/fig4_1_system_comparison.png)

*Figure 4.1: Relative assessment of concatenative synthesis systems across four dimensions. Scores derived from published documentation and community benchmarks.*

The figure quantifies a central ecosystem tension: systems with highest algorithmic depth (FluCoMa, AudioGuide) do not always score highest on accessibility. The Concatenator alone scores uniformly high across real-time, scalability, and accessibility, reflecting its commercial investment in interface polish and the corpus-size-independent particle filter [^179^].

---

## 5. The Neural Convergence: Deep Embeddings and Hybrid Architectures

The preceding chapters established the classical foundations of concatenative synthesis: handcrafted descriptors, Mahalanobis distance, kd-tree search, and the Hunt & Black unit selection framework. These methods remain the operational standard in real-time systems such as CataRT-MuBu and FluCoMa. Yet a parallel transformation is underway. Pretrained deep audio embeddings—vectors learned from millions of audio-text pairs—now offer semantic navigation that classical descriptors cannot achieve. Neural vocoders smooth transitions that waveform concatenation cannot mask. Diffusion models refine concatenative output without requiring paired training data. The question is no longer whether deep learning will influence corpus-based synthesis, but how neural and classical components can be composed into convergent architectures that preserve the identity and controllability of concatenative methods while gaining the expressivity and smoothness of neural generation.

### 5.1 Deep Audio Embeddings as Semantic Descriptors

For two decades, the field has been constrained by the perceptual-mathematical gap: verbal descriptors such as "bright," "rough," and "warm" map only partially onto measurable features such as spectral centroid and harmonic-to-noise ratio. Deep embeddings address this gap by learning to listen through the proxy task of learning to label.

#### 5.1.1 CLAP: Cross-Modal Perceptual Alignment

**CLAP** (Contrastive Language-Audio Pretraining) encodes audio and text into a shared 512-dimensional latent space using an HTSAT audio encoder and a RoBERTa text encoder, trained with InfoNCE loss [^34^]. On the Inst-Sim-ABX benchmark (Slakh2100), zero-shot LAION-CLAP achieves 71.9% agreement with human listeners on full-mix music similarity, competitive with specialized metric-learning models [^34^]. The contrastive objective forces the model to attend to acoustic cues humans prioritize for categorization, implicitly encoding cultural and semantic frameworks that structure similarity judgments [^34^]. For concatenative synthesis, this enables text-driven corpus retrieval: a performer can request units matching a natural language description rather than navigating by descriptor coordinates.

#### 5.1.2 MuQ-MuLan: Music-Specific Embedding Spaces

**MuLan** (Google Research, 2022) linked music audio to natural language descriptions by training on 44 million music recordings (370K hours) with weakly-associated text annotations. **MuQ** (Tencent AI Lab, 2025) extends this using Mel Residual Vector Quantization for self-supervised pretraining, achieving ROC-AUC 79.3 on MagnaTagATune—surpassing LAION-CLAP (73.9)—with only 0.9K hours of open-source data [^35^]. MuQ-MuLan's instrument-wise weighted similarity model reaches 90.4% perceptual agreement on Inst-Sim-ABX using Demucs source-separated stems, exceeding the 86.8% zero-shot baseline [^35^]. For concatenative synthesis, stem-level embeddings enable granular control over which instruments drive similarity—a capability impossible with global audio embeddings alone.

#### 5.1.3 MERT: Self-Supervised General-Purpose Understanding

**MERT** employs multi-task self-supervised learning combining an RVQ-VAE acoustic teacher and a CQT music teacher, trained on 160K hours of unlabeled music [^36^]. At 330M parameters—only 7% of Jukebox's count—MERT achieves state-of-the-art results across the MARBLE benchmark on nine downstream tasks including genre classification, key detection, and emotion analysis [^36^]. Unlike CLAP and MuQ-MuLan, MERT is audio-only, making it suitable for corpus navigation where text descriptions are unavailable.

#### 5.1.4 CLMR and Robustness to Perturbations

**CLMR** (ISMIR 2021) established that self-supervised contrastive learning on raw waveforms achieves competitive classification using 100x fewer labeled songs than supervised alternatives. Barnett et al. (2024) tested CLMR and CLAP robustness to pitch shift (±12 semitones), time stretch (±20%), and white noise overlay (±30 dB), finding that for all perturbations except large time stretches, CLMR is more robust than CLAP [^34^]. Both tolerate small pitch shifts (±3 semitones), but performance declines measurably under stronger perturbation. This profile is critical: real-time pitch transposition and time stretching in concatenative synthesis introduce variations that embedding-based retrieval must accommodate.

#### 5.1.5 Embedding Comparison Framework

**Table 5.1: Deep Audio Embeddings for Concatenative Corpus Navigation**

| Model | Dim | Pretraining | Music Agreement | Best Use Case for CBCS | Key Limitation |
|-------|-----|-------------|---------------|----------------------|----------------|
| CLAP (LAION) | 512 | Audio-630K + text | 71.9% full-mix [^34^] | Cross-modal text-audio retrieval | ~7 s temporal windows |
| MuQ-MuLan | 768–1024 | 44M music-text pairs | 90.4% instrument-wise [^35^] | Stem-level similarity control | Erratic for non-music adjectives |
| MERT | 768–1024 | 160K hours (SSL) | SOTA on MARBLE (9 tasks) [^36^] | General audio understanding | No text alignment |
| CLMR | 512–2048 | Raw waveforms (SSL) | Competitive vs. supervised | Robustness to perturbations | Weaker text-conditional retrieval |
| Classical descriptors | 13–230 | N/A | ~60–70% timbre | Real-time deterministic behavior | Semantic gap for high-level concepts |

The table reveals a specialization gradient. CLAP excels at cross-modal retrieval; MuQ-MuLan dominates music-specific tasks with source separation; MERT offers the strongest general-purpose audio understanding; CLMR provides the most robust embeddings under audio perturbation. Classical descriptors retain advantages in real-time deterministic behavior and interpretability: an MFCC coefficient has a direct acoustic meaning, whereas a dimension in a 512-dimensional CLAP vector does not. Hybrid systems combining embedding-based semantic organization with classical descriptor-driven real-time selection may capture the strengths of both paradigms.

### 5.2 Neural-Augmented Unit Selection

#### 5.2.1 DNN-Guided Target Cost Functions

Merritt et al. (2016) demonstrated that DNN bottleneck features replace hand-engineered weights in hybrid unit selection speech synthesis [^37^]. In Festival's Multisyn framework, DNN context embeddings outperformed HMM-generated parameters, showing that gains from statistical parametric synthesis transfer to hybrid unit selection [^37^]. Apple's Siri on-device TTS (2017) deployed this at scale, using deep and recurrent mixture density networks to predict target and concatenation distributions jointly for hundreds of millions of devices [^37^].

#### 5.2.2 kNN-SVC: SSL Embedding Retrieval with Neural Vocoder Resynthesis

**kNN-SVC** (Shao et al., ICASSP 2025) encodes source audio into WavLM SSL features, retrieves nearest-neighbor frames from a reference speaker corpus, and resynthesizes via HiFi-GAN [^38^]. The key innovation is a temporal concatenation cost added to the distance metric, autoregressively replacing temporally unfit candidates and optimizing combination weights to minimize discontinuity. Subjective evaluation (n=18) showed MOS 4.16 ± 0.10 and speaker similarity EER 43.79%, outperforming the kNN-VC baseline (MOS 3.98, EER 38.97%) and approaching the testset topline (MOS 4.21) [^38^].

#### 5.2.3 Embedding-Driven Search in Vector Databases

Vector databases (FAISS, Pinecone, Qdrant, Weaviate, Chroma) enable million-scale corpus search in milliseconds [^39^]. Barnett et al. stored 5 million clip embeddings in Pinecone for training data attribution, retrieving top-k neighbors by cosine similarity with millisecond latency [^39^]. **Audiobrain**, a Mac application, runs CLAP inference locally on Apple Silicon, processing tracks in 30–120 seconds and exporting 512-dimensional vectors for database ingestion [^39^]. For concatenative synthesis, this means $10^6$-unit corpora are searchable in interactive time via text queries—a scale previously inaccessible without custom engineering.

#### 5.2.4 The CLAP Latent Space as a Playable Interface

A 512-dimensional CLAP embedding defines a continuous semantic timbre space. Audio Atlas (ISMIR 2024) applies t-SNE to CLAP embeddings, producing navigable 2D maps where proximity corresponds to perceptual similarity [^34^]. Producers can select regions labeled by natural language clusters ("dark cinematic," "bright percussive") and retrieve corpus units from that neighborhood. The transition from coordinate-based navigation (centroid vs. loudness) to concept-based navigation (text prompt → embedding → nearest neighbor) redefines the performer-space relationship established by Wessel's timbre space nearly five decades ago.

### 5.3 Generative Neural Methods for Transition Smoothing

#### 5.3.1 Case Study: CoSaRef (Take and Akama, 2024/2025)

**CoSaRef** (Concatenative Synthesis and Refinement, Sony CSL) demonstrates a complete hybrid pipeline: MIDI input → concatenative sampler → diffusion refinement → realistic audio [^40^].

**Architecture.** Stage one assembles audio from note-length samples (NSynth) based on MIDI pitch, velocity, and timing, producing a structurally correct but timbrally synthetic track. Stage two applies Stable Audio Open diffusion refinement using zero-shot editing (SDEdit/ZETA), trained on audio-only datasets without MIDI annotations—requiring no paired training data [^40^].

**Results.** CoSaRef outperformed the state-of-the-art MIDI-supervised timbre-controllable method (DAGM fine-tuned on target instrumental audio) in both objective and subjective evaluation [^40^]. The diffusion refinement transforms the synthetic concatenative scaffold into audio with "nuanced similarities to the target performance while remaining faithful to the input MIDI" [^40^].

**Significance.** CoSaRef establishes a template: concatenative components handle discrete structural decisions (which note, which sample), while neural components handle continuous timbral refinement. The approach generalizes to rare instruments and user-provided corpora lacking large-scale annotated datasets.

#### 5.3.2 AFTER: Conditional Latent Diffusion for Seamless Transitions

**AFTER** (IRCAM ACIDS, 2024) combines RAVE-based neural audio coding with conditional latent diffusion for real-time polyphonic synthesis [^41^]. One audio stream sets timbre; a second input (audio or MIDI) shapes structure. AFTER generates audio on-the-fly, but diffusion's iterative denoising adds 200–500 ms latency [^41^]. The trade-off is explicit: quality and polyphony are gained at the cost of immediacy. AFTER is available as Max for Live devices and nn~ externals for Max/MSP and Pure Data [^41^].

#### 5.3.3 RAVE: Real-Time Neural Resynthesis Below 10 ms

**RAVE** (Caillon & Esling, 2021) integrates waveform-domain variational autoencoding with adversarial fine-tuning, generating 48 kHz audio at 20x real-time speed on standard laptop CPUs [^42^]. BRAVE (Caspe et al., 2025), a low-latency redesign, achieves sub-10 ms end-to-end delay with jitter below ±3 ms by reducing the encoder compression ratio from 2048 to 128, shortening PQMF filters, removing the noise generator, and training with causal convolutions exclusively [^42^]. The 4.9M-parameter model runs in real-time on CPU while preserving timbre-transfer quality. RAVE models run in Max/MSP and Pure Data via IRCAM's nn~ external, and NeuroRave deploys on Jetson Nano embedded hardware [^42^].

#### 5.3.4 Latent Granular Resynthesis and Differentiable Concatenative Synthesis

**Latent Granular Resynthesis** (Tokui & Baker, 2025) encodes a corpus into neural codec latent vector segments (EnCodec, SoundStream), matches target grains to codebook entries, and decodes through the codec's implicit interpolation—"naturally avoid[ing] the discontinuities typical of traditional concatenative synthesis" [^40^]. This requires no model training and is streamable. The broader category of **differentiable concatenative synthesis** backpropagates loss gradients through DSP components, enabling end-to-end optimization of selection and synthesis parameters [^40^].

### 5.4 Neural Audio Codecs and Corpus Compression

#### 5.4.1 SoundStream and EnCodec: Learned Discrete Representations

SoundStream (Google Research, 2021) compresses speech, music, and general audio at 24 kHz into 3–18 kbps using a convolutional encoder/decoder with residual vector quantization, trained end-to-end with adversarial and reconstruction losses [^40^]. In MUSHRA evaluation, SoundStream at 3 kbps outperformed Opus at 12 kbps and approached EVS at 9.6 kbps—using one-third the bitrate [^40^]. EnCodec (Meta AI, 2023), used in MusicGen, operates at 32 kHz with four stacked codebooks of 2048 entries each [^40^]. A one-hour stereo corpus at 44.1 kHz/16-bit occupies ~635 MB uncompressed; at SoundStream's 6 kbps, this compresses to ~27 MB (23x reduction), and at 3 kbps to ~15 MB (42x reduction).

#### 5.4.2 Neural Codec Embeddings as Search Features

The latent vectors preceding quantization in neural codecs capture spectral and timbral structure at reduced temporal resolution. These vectors serve as search features: instead of matching MFCC frames, the system matches codec latent frames. Because the decoder implicitly smooths transitions between latent vectors, concatenation in latent space produces smoother output than waveform-domain concatenation [^40^]. Token sequences themselves can be treated as concatenative units—discrete symbols with learned acoustic meanings—enabling "training-free" neural mosaicing.

#### 5.4.3 Implications for Corpus Scalability

Classical concatenative synthesis bounds corpus size by RAM. Neural codecs relax this constraint via compressed token storage (10–40x reduction) and fast token-level search in vector databases [^39^]. Barnett et al.'s 5-million-clip Pinecone index demonstrates that corpora previously impractical (entire sample libraries, years of field recordings) are now navigable in interactive time [^39^]. The scalability bottleneck shifts from memory capacity to offline index construction.

### 5.5 The Convergent Architecture

#### 5.5.1 Hybrid Pipeline Design Patterns

A mature neural-enhanced concatenative synthesizer decomposes into five stages:

1. **Corpus ingestion**: Classical descriptors (MFCC, spectral, perceptual) and deep embeddings (CLAP, MuQ, MERT) computed in parallel.
2. **Search**: Classical kd-trees for exact real-time nearest-neighbor search in low-dimensional descriptor space; vector databases (FAISS, Pinecone) for semantic nearest-neighbor retrieval in embedding space [^39^].
3. **Unit selection**: Hunt & Black target cost + concatenation cost framework, enhanced by DNN-predicted cost distributions [^37^] and SSL embedding distances [^38^].
4. **Transition smoothing**: Overlap-add/WSOLA for real-time; neural vocoders and diffusion refinement (CoSaRef [^40^]) for offline/buffered cases; neural codec decoders for implicit latent smoothing [^40^].
5. **Output**: Waveform concatenation for lowest latency; neural vocoder resynthesis for highest quality; RAVE/BRAVE for real-time neural resynthesis below 10 ms [^42^].

This pipeline preserves the identity-preserving strength of concatenative selection—every output grain originates from a real recording—while leveraging neural methods where they excel: semantic retrieval, smooth transitions, and compression.

#### 5.5.2 Quality, Controllability, and Computational Cost: A Three-Way Trade-Off

![Figure 5.1: Three-Way Trade-Off in Concatenative Synthesis Architectures](/mnt/agents/output/fig_5_1_tradeoff_radar.png)

**Figure 5.1** visualizes the trade-off space across five dimensions. Classical concatenative synthesis (CataRT) scores highest on temporal controllability and low latency—performers navigate descriptor space with immediate response [^34^]. Its weakness is semantic navigation: performers must know which descriptors map to their perceptual intent. Pure neural systems excel at semantic navigation and corpus scalability but sacrifice temporal controllability and latency: diffusion requires 200–500 ms for iterative denoising [^41^], and generative models lack the precise onset timing of concatenative selection. Hybrid architectures (CoSaRef, kNN-SVC) occupy the middle ground, trading some latency for improved quality and semantic capability while preserving the selection structure that gives concatenative synthesis its identity.

The quantified latency boundaries are decisive: below 10 ms (BRAVE [^42^]), real-time interactive performance is feasible; 20–50 ms permits gestural control but not tight rhythmic interaction; above 200 ms (AFTER [^41^]), the system operates in "predictable delay" mode suitable for texture generation rather than instrumental performance.

#### 5.5.3 SelectTTS and the Speech-Music Divergence Revisited

The speech-music divergence identified in preceding chapters takes on new nuance in the neural era. Speech synthesis has moved fully neural, yet concatenative methods persist through frame-selection systems such as **SelectTTS** (2024), which achieves better speaker similarity than XTTS-v2 and VALL-E with 8x fewer parameters (57M vs. 466M) and 270x less training data (100 hours vs. 27K hours) [^40^]. SelectTTS predicts semantic units from text, then selects frames from the target speaker's reference speech using WavLM SSL features decoded by HiFi-GAN—essentially a concatenative system with neural feature extraction and neural resynthesis.

Why does concatenative hybrid architecture persist in music while speech moved fully neural? Speech has a clear optimization target: intelligible, natural-sounding utterances of specified text. Neural models eventually solved this better than corpus stitching. Music has no such single target—musicians want idiosyncrasy, specific timbral identity, and surprise from known recordings. Neural generative models produce plausible but generic music. Hybrid concatenative systems constrain neural generation to specific timbres, preserving the identity that makes corpus-based synthesis musically meaningful. The trajectories are opposite: speech went neural to escape corpus limitations; music is returning to corpora to escape the genericism of neural generation [^40^].

The convergent architecture for musical concatenative synthesis is therefore not a transitional stage toward fully neural systems, but a stable equilibrium: concatenative selection provides identity and structural fidelity, while neural embeddings, vocoders, and diffusion models provide semantic access, transition smoothness, and storage efficiency. Research investment targeting this convergence—rather than either pure paradigm—offers the strongest path toward next-generation corpus-based instruments.

---

## 6. Creative Practice and the Corpus-as-Instrument

### 6.1 The Ontological Shift: From Sample Library to Playable Topology

#### 6.1.1 CataRT as Digital Musical Instrument

The decisive reorientation in concatenative synthesis occurred when Diemo Schwarz presented CataRT not as a sound-design utility but as a Digital Musical Instrument (DMI) at NIME 2012. In "The Sound Space as Musical Instrument: Playing Corpus-Based Concatenative Synthesis," Schwarz argued that the instrument is not the playback engine or the controller, but the navigable descriptor space itself—the corpus topology through which the performer moves [^7^]. This inverted the traditional tool-material relationship. In a sampler, the library is inert content and the keyboard is the instrument. In synthesis, the instrument is the signal-processing algorithm. In corpus-based concatenative synthesis, the instrument is the spatialized field of timbral possibilities that emerges from descriptor analysis, and the performer's action is navigation rather than triggering.

The sound space is produced by segmenting a corpus into units, extracting a descriptor vector for each, and projecting the high-dimensional data to two or three dimensions via Principal Component Analysis or user-selected pairs [^7^]. Each point represents a single sound unit; proximity indicates timbral similarity. The performer specifies a target position in descriptor space, and the system selects the nearest corpus units in real time.

#### 6.1.2 Navigational Knowledge and Transferred Virtuosity

If the instrument is a space, proficiency is measured by navigational knowledge: the performer's learned understanding of where sonic qualities reside within a specific corpus topology. This knowledge is corpus-specific, just as a violinist's fingerboard knowledge is instrument-specific. Schwarz notes that experienced performers memorize fixed corpora and rehearse without visual reference, a mode he describes as "more focused and expressive" [^7^].

The concept of transferred virtuosity was articulated by Tremblay and Schwarz in their NIME 2010 paper on the Sandbox bass-and-laptop duo. A performer's instrumental technique—developed over years on electric bass—could be "recycled" onto foreign audio material via audio mosaicing: gestural expressivity was preserved while timbre was replaced [^45^]. Motor skill thus becomes portable across corpora.

#### 6.1.3 The "Corpus-as-Instrument" Paradigm

The corpus-as-instrument paradigm introduces a qualitative distinction from both sampling and synthesis. Sampling is playback of recordings: the performer controls only triggering, transposition, and amplitude. Synthesis is algorithmic generation: the performer controls parameters of a mathematical waveform process. Concatenative synthesis occupies a third category: the performer navigates a pre-analyzed topology of existing sounds, selecting and concatenating units based on perceptual descriptors.

Figure 6.1 conceptualizes this tripartite taxonomy. Panel (a) depicts the sampling paradigm: a linear library accessed by index. Panel (b) depicts the synthesis paradigm: a parametric algorithm generates waveforms from mathematical functions. Panel (c) depicts the corpus-as-instrument paradigm: a navigable descriptor space where each point represents a corpus unit and the performer's trajectory determines which units are selected, concatenated, and transformed in real time. In (a) and (b), material and control are separated; in (c), the material itself is restructured into the control topology.

### 6.2 Composition by Navigation

#### 6.2.1 Solution Spaces

The "solution spaces" framework, developed by Schwarz and Benjamin Hackbarth, treats compositional variation as a spatial problem. Rather than producing a single mosaicing output, the composer generates a field of outputs by varying the algorithm's parameters and arranges these in a navigable space [^20^]. In their implementation, 729 parameter combinations were run through AudioGuide, producing 729 mosaic variants of the same target. Multidimensional scaling organized these by inter-solution similarity, creating a physical model where target distance mapped to link length [^21^]. The composer then browses and composes paths through this space. Schwarz and Hackbarth reject the premise that mosaicing should pursue only faithful reproduction: "both semblance and dissemblance have compositional utility" [^43^].

#### 6.2.2 Cross-Corpus Selection and Timbre Space Exploration

Cross-corpus selection extends navigation to simultaneous selection from multiple heterogeneous databases. In Gervasoni's 2007 piece *Whisper Not* for viola and electronics, CataRT's selection from a viola corpus drove a parallel water-drop corpus, producing a gradual interpolation in which pizzicato gestures were replaced by water sounds while retaining their timbral evolution [^27^].

Einbond and Schwarz extended this into spatial audio composition. Building on Wessel and Grey's 1970s research that listeners group disparate timbres according to low-dimensional spatial models, they proposed "timbre-space as the point of departure for the parametrization of spatial trajectories" [^32^]. CataRT descriptor coordinates were mapped to loudspeaker positions via VBAP and Wave Field Synthesis, so that navigating timbre space simultaneously navigated the concert hall's acoustic space.

#### 6.2.3 Algorithmic Composition and Factor Oracle Approaches

The Metacreation Lab has integrated concatenative synthesis with machine-learning improvisation in the MACAT and MACataRT systems. MACAT combines Self-Organizing Maps for timbre clustering with Variable Markov Models for temporal structure and a Factor Oracle for real-time pattern navigation [^44^]. The Factor Oracle—a suffix automaton adapted by Assayag and Dubnov for musical sequences—enables the system to jump through learned patterns, generating variations stylistically coherent with the training corpus [^44^]. MACataRT offers reactive improvisation (responding to live input) and proactive improvisation (autonomous Factor Oracle-driven generation from offline-learned patterns) [^48^].

#### 6.2.4 Live Corpus Building and On-the-Fly Analysis

Live corpus building collapses the boundary between preparation and performance. Starting from an empty corpus, CataRT segments and analyzes incoming audio in real time, adding units to a dynamically expanding descriptor space [^31^]. In the 2006 performance *Rien du tout*, Schwarz and Sam Britton built a corpus from concert hall ambience, allowing the performance to evolve from nothing into a structured improvisation [^30^]. Not all composers embrace this indeterminacy: Fujikura and Gervasoni initially explored live corpus building but chose pre-recorded corpora for greater predictability [^39^].

### 6.3 Temporal Structure and the Rhythmic Blind Spot

#### 6.3.1 Timbre-Centric Design

Concatenative synthesis descriptor sets are systematically biased toward spectral and timbral characteristics. The canonical descriptors—pitch, loudness, spectral centroid, noisiness, spectral flatness—capture what a sound is, not where it falls in metric time [^7^]. There is no standard descriptor for onset phase relative to a beat grid or metric position embedded in unit-selection criteria. The trigger modes reinforce this: `beat` triggers at a user-specified rate, but that rate is a global parameter, not a metric analysis of corpus units.

#### 6.3.2 Beat-Synchronized Unit Selection

Automatic segmentation may not align with attack transients, introducing timing jitter negligible for texture but problematic for percussive precision [^7^]. Gestural controllers introduce latency imperceptible for melodic contexts but noticeable for precise rhythmic patterns. Schwarz acknowledges that while CataRT can generate a steady beat, it is "nearly impossible to vary enough to be musically interesting" [^7^]. Somax2 version 2.6 introduced "beat phase optimisation" to align selection with detected metric positions [^6^], but these remain add-ons: the descriptor space is timbral, and rhythmic alignment is achieved through post-selection quantization rather than metric descriptors guiding selection.

#### 6.3.3 The Temporal Blind Spot as a Fundamental Limitation

The temporal blind spot is a structural consequence of the corpus-as-instrument paradigm. When the instrument is a timbre space, the performer's primary affordance is spectral morphing. Rhythmic structure must be imposed from outside—by trigger timing, external clock synchronization, or algorithmic sequencers. Concatenative synthesis excels at texture, color, and timbral evolution; it struggles to produce metrically precise output because its fundamental unit of organization is the descriptor vector, not the beat.

### 6.4 Artist Case Studies and Performance Contexts

#### 6.4.1 Aaron Einbond: Timbre, Space, and Notation

Aaron Einbond's work represents one of the most sustained applications of corpus-based concatenative synthesis in contemporary composition. In *Cartographies* (2009/2011), he employed corpus-based spatialization: performers triggered CataRT units whose descriptor coordinates were mapped to loudspeaker positions, creating concert-hall geometry derived from timbral navigation [^32^]. The same work demonstrated corpus-based transcription: target sounds were matched to an instrumental corpus, and selected units' descriptors were converted into notated scores for live performers [^33^]. This technique bridges the signal-domain world of concatenative synthesis with the symbolic domain of instrumental music.

In *Without Words* (2012), Einbond extended the paradigm into audio-visual territory with the video duo Things Happen. MIDI controllers manipulated live video layers, with luminosity mapped to descriptor continua and image position mapped to CataRT's navigation axes [^36^]. Visual descriptors—warmth, detail, blur sharpness—were mapped to audio synthesis parameters including grain attack times and triggering frequency [^35^]. This cross-modal application demonstrates that the corpus-as-instrument paradigm generalizes to any media corpus with analyzable perceptual descriptors.

Table 6.1 maps the creative techniques surveyed in this chapter across their descriptor requirements, real-time viability, output modality, and representative practitioners.

**Table 6.1: Creative Techniques in Corpus-Based Concatenative Synthesis**

| Technique | Core Descriptors | Real-Time | Output Modality | Representative Works |
|-----------|------------------|-----------|-----------------|----------------------|
| Composition by navigation | User-selected pairs (pitch, brightness, noisiness) | Yes | Audio, spatial audio | Einbond & Schwarz [^32^] |
| Cross-corpus selection | Shared descriptors across corpora | Yes | Audio, timbral morphing | Gervasoni, *Whisper Not* [^27^] |
| Solution spaces | Parameter-weight permutations | No (offline) | Audio variants, 2D MDS | Schwarz & Hackbarth [^20^] |
| Corpus-based orchestration | Instrument-specific corpora | Yes (pre-recorded) | Audio, multi-corpus layering | Fujikura, *swarming essence* [^28^] |
| Corpus-based transcription | Timbral descriptors → symbolic pitch/duration | No | Notated score, live ensemble | Einbond, *Cartographies* [^33^] |
| Live corpus building | Navigation + real-time segmentation | Yes | Audio, emergent structure | Schwarz & Britton, *Rien du tout* [^30^] |
| Audio-visual mosaicing | Visual descriptors mapped to audio | Yes | Audio + video, cross-modal | Einbond, *Without Words* [^36^]; VIVO [^35^] |
| Machine improvisation | SOM clusters + Factor Oracle sequences | Yes | Audio, agent-generated | Metacreation Lab, MACataRT [^48^] |

The progression from row one to row eight traces an expansion from single-sense timbre navigation toward multi-modal, multi-agent creative platforms. Each technique preserves the core operation—nearest-neighbor selection in descriptor space—while varying what is navigated, who is navigating, and what outputs are produced. Techniques that remain within a single audio corpus tend to support real-time performance, while those that cross into notation, multiple corpora, or visual domains typically require offline preparation or hybrid workflows.

#### 6.4.2 Institutional and Broader Communities

The institutional lineage runs through IRCAM and the electroacoustic tradition. Composers employing CataRT include Dai Fujikura, whose *swarming essence* (2007) used ten corpora of orchestral phrases with the instrumental part composed to match the electronics' harmonic content [^28^]; Stefano Gervasoni, whose *Whisper Not* demonstrated cross-selection between viola and water corpora [^27^]; and Sam Britton, whose *Junkspace* (2006) re-sequenced instrumental improvisations, treating "time as just another descriptor amongst many" [^37^].

Beyond the academy, the 2024–2025 tooling wave reaches producer communities. Mosaïque's 3D visualization and Max for Live integration places descriptor-space navigation within Ableton Live workflows [^3^]. The Concatenator plugin's commercial release at $149 represents the first explicitly marketed concatenative synthesizer for mainstream sound designers [^1^].

#### 6.4.3 Interdisciplinary and Installation Applications

The paradigm has migrated into installation and interdisciplinary art. The VIVO system (2024) extends concatenative principles to video analysis, adding visual descriptors—color, texture, detail, brightness, entropy, movement—to the corpus [^35^]. Environmental sound transcription represents another trajectory. In Einbond's *What the Blind See* (2009), ambient field recordings were transcribed into instrumental notation via corpus-based matching [^34^]. The convergence of environmental sound, instrumental writing, and real-time electronics within a single corpus-based workflow demonstrates the paradigm's capacity to unify domains that traditional practice treats separately.

---

## 7. Markets, Law, and the Adoption Paradox

### 7.1 The Commercial Landscape: A Near-Empty Market

Despite more than two decades of mature corpus-based concatenative sound synthesis (CBCS) research, the commercial market is almost empty. The DSP foundations—real-time nearest-neighbor search, descriptor extraction, unit selection—have been documented since CataRT's debut at DAFx 2006. Yet as of early 2026, exactly one commercial plugin implements the method as its primary paradigm.

**The single commercial plugin.** In April 2025, DataMind Audio released *Concatenator*, a VST/AU/AAX plugin priced at $149, built on the Bayesian particle-filter architecture published at ISMIR 2024 [^3^]. The algorithm treats corpus window indices as hidden states and the incoming target audio as an observation; a critical claim is that computational complexity is independent of corpus size, enabling scaling to corpora measured in hours [^3^]. Coverage described the tool as an "audio mosaicking" instrument reconstructing live input from user-loaded fragments [^1^][^2^]. DataMind's "Artist Brains" licensing framework allocates 50 percent of revenue to training artists, signaling awareness that corpus provenance is a commercial liability [^5^][^6^].

**The open-source ecosystem.** Table 1 summarizes the status of principal non-commercial tools. CataRT remains active through the MuBu extension for Max; standalone CataRT and SKataRT require an IRCAM Forum subscription at ~€200/year [^11^][^12^]. Mosaïque, developed at Université de Montréal, released v0.2 in 2025 as a free instrument aimed at "democratizing" CBCS for non-coding musicians [^7^][^8^][^10^]. AudioGuide, the Python framework by Hackbarth, Schnell, Esling, and Schwarz, is static—functional but without active development [^14^]. The ERC-funded FluCoMa toolkit provides KDTree-based real-time concatenative primitives for Max, SuperCollider, and Pure Data, with active community examples but uncertain long-term sustainability.

| Tool | Platform | Price | CBCS Type | Maintenance Status | Citation |
|:---|:---|:---|:---|:---|:---|
| Concatenator | VST/AU/AAX (Win/Mac) | $149 | Bayesian real-time mosaicing | Active (commercial) | [^1^][^3^] |
| Mosaïque | Max for Live / Standalone | Free | Descriptor-based corpus navigation | Active (v0.2, 2025) | [^7^][^10^] |
| CataRT-Mubu | Max patches | Free (needs Max) | Real-time timbre space | Active (MuBu branch) | [^11^] |
| SKataRT | Max for Live | ~€200/yr (IRCAM Forum) | Mosaicing + XY timbre space | Active | [^12^] |
| AudioGuide | Python / CLI | Free | Non-real-time dense layering | Static | [^14^] |
| FluCoMa | Max / SC / Pd | Free | KDTree unit selection | Active (ERC-funded) | — |
| C-C-Combine | SuperCollider | Free | Corpus concatenation | Unmaintained | — |

*Table 1. Maintenance status of major concatenative synthesis tools as of early 2026. "Active" denotes updates or community support within 18 months; "Static" denotes no active development; "Unmaintained" denotes deprecated.*

For musicians seeking a turnkey concatenative instrument without coding or Max literacy, Concatenator is the only option.

**Granular synthesis as de facto commercial alternative.** The market contrast is stark. Output Portal ($149), Arturia Pigments 7 (~$99–199), UVI Falcon ($349+), and Ableton's bundled Granulator III all provide granular engines [^16^][^18^]. Hardware granular instruments have proliferated, yet none implements descriptor-driven unit selection from heterogeneous corpora. The sonic results of granular synthesis often overlap perceptually with concatenative output, reducing commercial incentive to engineer the more complex CBCS pipeline. A practitioner on the VI-Control forum summarized the experience: "A lot of solutions seem to be written from an academic Proof-of-Concept point of view and not so much with actual musicians in mind" [^47^].

**Game audio middleware: an untapped billion-dollar market.** The global audio middleware for games market reached USD 1.47 billion in 2024, with Wwise and FMOD commanding an estimated 67 percent combined share among AAA studios [^34^]. Neither platform offers corpus-based concatenative synthesis, despite CBCS aligning with game audio's core constraints: memory limitations favor small corpora with algorithmic variation, interactivity demands real-time response, and timbral identity must be preserved across dynamic contexts.

### 7.2 Copyright Law and the Clearance Culture

The near-empty commercial market is not explained by technical immaturity. The constraint is legal risk. Concatenative synthesis inherently requires a corpus of pre-existing recordings; every unit selection raises the question of whether the source was licensed. This section traces the arc from sampling precedent to AI training data liability.

![Legal Timeline: From Sampling Precedent to AI Training Data Liability (1991–2025)](/mnt/agents/output/concat_synth_sec07_timeline.png)

*Figure 1. Legal timeline of landmark cases governing reuse of copyrighted sound recordings, from the sampling litigation era through the AI training data liability era. Diagram: author; sources annotated in figure.*

**Grand Upright v. Warner Bros. (1991): the sampling precedent.** In *Grand Upright Music, Ltd. v. Warner Bros. Records, Inc.*, the U.S. District Court for the Southern District of New York addressed Biz Markie's unauthorized use of a piano riff from Gilbert O'Sullivan. Judge Kevin Thomas Duffy opened his opinion with "Thou shalt not steal," treated unlicensed sampling as *per se* copyright infringement regardless of duration or transformative intent, and suggested criminal prosecution [^1^]. The ruling terminated the "Wild West" era of unlicensed sampling and initiated the modern clearance culture. For concatenative synthesis, the decision established that recombination of copyrighted recordings without license is presumptively infringing.

**Bridgeport v. Dimension Films (2005): the bright-line rule.** The Sixth Circuit hardened the standard further. A two-second guitar chord from Funkadelic's "Get Off," looped to sixteen seconds in the film *I Spy*, was ruled infringing. The court articulated a bright-line rule: "Get a license or do not sample" [^2^]. The decision eliminated the *de minimis* defense and cemented the economic reality that dense sample-based production would be financially unviable. Legal scholars have estimated that re-creating the Beastie Boys' *Paul's Boutique* today could require clearance budgets exceeding $20 million [^2^].

**The AI litigation era.** The 2024–2025 period transformed training data liability from speculative risk to enforceable doctrine. On June 24, 2024, the RIAA—representing Universal Music Group, Sony Music, and Warner Music—filed coordinated lawsuits against Suno and Udio, alleging "mass infringement of copyrighted sound recordings on an almost unimaginable scale" and seeking statutory damages of up to $150,000 per infringed work [^3^][^4^]. Suno conceded that its model was trained on copyrighted music from "the open internet" while defending the practice as fair use: "Learning is not infringing" [^5^].

In February 2025, the U.S. District Court for Delaware issued the first federal ruling rejecting a fair use defense for AI training. *Thomson Reuters Enterprise Centre GmbH v. Ross Intelligence Inc.* found that Ross's use of Thomson Reuters' headnotes to train a competing tool was not transformative under the Supreme Court's 2023 *Andy Warhol Foundation v. Goldsmith* framework, and harmed the market for training data licenses [^6^]. On November 11, 2025, the Munich Regional Court ruled in *GEMA v. OpenAI* that LLMs store reproducible copies of copyrighted lyrics, rejected the EU TDM exception defense, and held OpenAI liable for user-generated infringing outputs [^26^].

**Schwarz's prescient warning.** In 2006, Diemo Schwarz observed that "concatenative synthesis from existing song material evokes tough legal questions of intellectual property, sampling and citation practices." No subsequent court decision has relaxed the standard; the *Bridgeport* bright-line rule and the 2024–2025 AI litigation wave have only amplified the risk. The concatenative pipeline—segmenting, matching, and concatenating units from corpora—maps directly onto the sampling conduct that *Grand Upright* and *Bridgeport* declared infringing absent a license.

### 7.3 Pathways Forward: Attribution, Licensing, and Open Corpora

If copyright law is the primary bottleneck, the field's commercial viability depends on legal engineering as much as DSP engineering. Three pathways are emerging: open-licensed corpora, technical attribution systems, and regulatory frameworks that mandate transparency.

**FreeSound and Creative Commons.** Launched in 2005 by the Music Technology Group at Universitat Pompeu Fabra, FreeSound hosts over 670,000 sounds with 94.2 million cumulative downloads [^7^]. Sounds are licensed under CC0, CC BY, or CC BY-NC. In June 2024, FreeSound published AI-specific guidelines: CC-BY sounds may be used for model training only if attribution is provided upon distribution, while CC-BY-NC sounds may not be used for commercial AI training [^8^]. For concatenative tools shipping with bundled corpora, this offers a legally navigable path—provided the corpus is restricted to CC0 or CC-BY material.

**Barnett et al. on training data attribution.** A 2024 study proposed a replicable methodology using CLMR and CLAP audio embeddings on VampNet (trained on 795,000 songs) [^9^]. By splitting outputs and training data into 3-second segments and computing embedding similarity, the framework identifies the most influential corpus materials. A human listening study established a cosine-similarity threshold of 0.875 (CLMR); above it, over 30 percent of outputs had at least one highly similar training source [^30^]. The methodology shifts practice from "ignorant appropriation to informed creation" [^9^]—directly relevant to concatenative synthesis, where the corpus-to-output linkage is more explicit than in latent models.

**The EU AI Act and emerging regulatory frameworks.** Adopted March 13, 2024, the EU AI Act mandates that general-purpose AI providers comply with EU copyright law, including the TDM opt-out provisions of the DSM Directive, and publish summaries of training data [^10^]. Article 50 requires synthetic audio outputs to be marked as artificially generated, with penalties up to €30 million or 7 percent of global turnover [^42^]. In the United States, the proposed NO FAKES Act (July 2024) aims to establish a federal right of publicity protecting voices from unauthorized AI replicas [^11^], while the TRAIN Act and CLEAR Act propose training data transparency mandates [^43^].

**Why concatenative synthesis faces a unique legal barrier.** Subtractive, FM, wavetable, and physical modeling synthesis require no pre-existing recordings; sound is generated from oscillators, modulation, or simulated acoustics. Concatenative synthesis, by definition, begins with a corpus of existing audio. Granular synthesis operates on single-source samples loaded by the user; the vendor avoids the liability chain. Concatenative tools that ship with bundled corpora—or algorithmically match user-loaded corpora in ways producing recognizable derivatives—step directly into the *Bridgeport* bright-line rule. The result is an adoption paradox: the DSP has been mature for twenty years, the open-source tools are freely available, yet the commercial market contains one plugin—because scaling concatenative synthesis requires solving a copyright clearance problem that no other paradigm faces.

---

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

---



# References

[1] Britannica / ISM Research Starters. https://www.britannica.com/art/musique-concrete / https://www.ebsco.com/research-starters/music/musique-concrete

[2] For the Love of Noise / Schaeffer's "In Search of a Concrete Music". https://fortheloveofnoise.com/2021/05/04/the-birth-of-musique-concrete-part-one/

[3] Schwarz et al., Principles and Applications of Interactive Corpus-Based Concatenative Synthesis (.... http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf

[5] Wikipedia / SFU Truax. https://en.wikipedia.org/wiki/Granular_synthesis / https://www.sfu.ca/~truax/gran.html

[6] Schwarz, Concatenative Sound Synthesis (IRCAM thesis/monograph). http://articles.ircam.fr/textes/Schwarz06b/index.pdf

[7] MIT Press / Schwarz 2006 references. https://mitpress.ublish.com/book/the-computer-music-tutorial

[8] Wikipedia / Out of Phase. https://en.wikipedia.org/wiki/Fairlight_CMI

[9] Flanagan & Golden 1966, Bell System Technical Journal. http://course.ece.cmu.edu/~ece792/handouts/FlanaganGolden66.pdf

[10] Vapi.ai — How to Create Natural Audio Using Concatenative Synthesis. https://vapi.ai/blog/concatenative-synthesis

[11] Portnoff 1976 IEEE Trans. ASSP / Stanford STANM report. http://labrosa.ee.columbia.edu/~dpwe/papers/Portnoff76-pvoc.pdf

[12] IEEE Trans. ASSP 1980. https://www.mathworks.com/help/signal/ref/istft.html (citing Portnoff)

[13] Crochiere 1980 IEEE Trans. ASSP. https://calebrascon.info/PDA/Topic4/addresources/WOLA.pdf

[14] Griffin & Lim 1984 IEEE Trans. ASSP. https://speechprocessingbook.aalto.fi/Modelling/griffinlim.html

[15] Computer Music Journal 1986. https://www.eumus.edu.uy/eme/ensenanza/electivas/dsp/presentaciones/PhaseVocoderTutorial.pdf

[16] Laroche & Dolson 1999 IEEE Trans. Speech and Audio Processing. https://www.ee.columbia.edu/~dpwe/papers/LaroD99-pvoc.pdf

[17] Moulines & Charpentier 1990 Speech Communication / Learnius. https://learnius.com/slp/9+Speech+Synthesis/1+Fundamental+Concepts/2+Technologies/pitch-synchronous+overlap-add+(TD-PSOLA)

[18] Texas A&M lecture notes / UIUC ECE 420. https://courses.physics.illinois.edu/ece420/sp2019/5_PSOLA.pdf

[19] d'Alessandro 1989 / Speech Communication 2000 citations. https://www.sciencedirect.com/science/article/abs/pii/S0167639399000515

[21] Rudresh et al. 2018 arXiv. https://arxiv.org/abs/1801.06492

[22] Hunt & Black 1996 ICASSP / Aalto Speech Processing Book. https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf / https://speechprocessingbook.aalto.fi/Synthesis/Concatenative_speech_synthesis.html

[23] Hunt & Black 1996 ICASSP. https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf

[24] Hunt & Black 1996 / Diaz et al. Eurospeech 2003. https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf / https://www.isca-archive.org/eurospeech_2003/diaz03_eurospeech.pdf

[25] Chappell & Hansen 1998 ICSLP / Speech Communication 2002. https://www.isca-archive.org/icslp_1998/chappell98_icslp.pdf / https://www.utdallas.edu/~jxh052100/Publications/JP-38-SpeechComm-DavidChappell-JohnHansen-SegmentSynthesis-Mar02.pdf

[27] Plumpe et al. 1998 Microsoft Research / ICSLP. https://www.microsoft.com/en-us/research/wp-content/uploads/1998/12/1998-plumpe-icslp.pdf

[28] Speech.zone / Learnius. https://speech.zone/courses/speech-processing/module-6-speech-synthesis-waveform-generation-and-connected-speech/videos/overlap-add/

[29] Schwarz 2000 DAFx / Schwarz 2006 DAFx (CataRT). http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf

[31] Schwarz 2006 JNMR. https://hal.science/hal-01161361v1/document

[32] Schwarz 2004 PhD thesis. http://recherche.ircam.fr/anasyn/schwarz/thesis/report.pdf

[33] Schnell & Schwarz 2005 DAFx. http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2005/SchnellSchwarz_DAFX2005_Gabor-Multi-Representation-Real-Time-Analysis-Synthesis.pdf

[35] Zils & Pachet 2001 DAFx. https://www.francoispachet.fr/wp-content/uploads/2021/01/zils-01a.pdf

[36] Simon et al. 2005 ICMC. https://www.microsoft.com/en-us/research/project/computational-tools-for-music/publications/

[38] Towards Maximal Convergence / UPF repository. https://repositori.upf.edu/bitstreams/65b83114-186c-4970-bc15-4067028b79a0/download

[39] Roads / Curtis Roads homepage / Wikipedia. https://www.curtisroads.net/s/7-RoadsKilgoreDuPlessis-CMJ-copy.pdf / https://en.wikipedia.org/wiki/Granular_synthesis

[40] SFU Truax page / Wikipedia. https://www.sfu.ca/~truax/gran.html / https://en.wikipedia.org/wiki/Granular_synthesis

[41] Schwarz 2006 DAFx / Schwarz 2010 eContact. https://econtact.ca/16_2/schwarz_corpus.html

[42] CataRT documentation / Somax documentation / Concatenative synthesis fundamentals. http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf / https://repmus.ircam.fr/_media/merci/merci-ha2-onsetdetection-0.2.0.pdf

[43] Somax onset detection documentation (IRCAM). https://repmus.ircam.fr/_media/merci/merci-ha2-onsetdetection-0.2.0.pdf

[44] CataRT 2006 / Concatenative synthesis fundamentals. http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf / https://grokipedia.com/page/concatenative_synthesis

[45] Schwarz et al. 2006 DAFx / Schwarz 2008 JIM. http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf / http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf

[46] Schwarz & Schnell 2016 DAFx. https://hal.science/hal-01427393v1/document

[47] Festvox documentation. http://festvox.org/festvox-1.2/festvox_8.html

[48] Chappell & Hansen 1998. https://www.isca-archive.org/icslp_1998/chappell98_icslp.pdf

[49] IRCAM Somax2 / STMS Lab. https://www.stms-lab.fr/projects/pages/somax2/ / https://ressources.ircam.fr/fr/media/xe0cc49_somax-26-and-reach-co-creative-tools

[50] Vapi.ai blog / Telnyx. https://vapi.ai/blog/concatenative-synthesis / https://telnyx.com/learn-ai/concatenative-synthesis

[51] arXiv 2024. https://arxiv.org/html/2411.04366v1

[52] Schwarz 2004 thesis / Schwarz 2007 IEEE SPM. http://recherche.ircam.fr/anasyn/schwarz/thesis/abstract-en.html

[53] Hunt & Black 1996 / Diaz et al. 2003. https://www.isca-archive.org/eurospeech_2003/diaz03_eurospeech.pdf

[55] Sturm 2006 JNMR. http://articles.ircam.fr/textes/Schwarz06b/index.pdf (citing Sturm)

[56] AudioDec Demo (Meta Reality Labs). https://bigpon.github.io/AudioDec_demo/

[59] Schwarz, DAFx 2006; HAL current research. https://www.dafx.de/paper-archive/2006/papers/p_279.pdf; https://hal.science/hal-01161337v1/document

[80] Schwarz, JIM 2008; Schwarz et al., DAFx 2006. http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf; https://www.dafx.de/paper-archive/2006/papers/p_279.pdf

[172] VI-Control forum / IRCAM Forum. https://vi-control.net/community/threads/new-ircam-ableton-max-for-live-toy-concatenative-synthesis-skatart.115599/

[271] FRCTLAUDIO (GRN vs Portal comparison); Whoknowsfrankynelly (Autochroma vs Portal). https://frctlaudio.com/blog/grn-vs-output-portal; https://whoknowsfrankynelly.com/autochroma_vs_portal/

[272] Perfect Circuit (Clouds Retrospective); Mutable Instruments Documentation. https://www.perfectcircuit.com/signal/mutable-clouds-retrospective; https://pichenettes.github.io/mutable-instruments-documentation/trivia_and_history/clouds_history/

[276] Mutable Instruments Documentation — Clouds History. https://pichenettes.github.io/mutable-instruments-documentation/trivia_and_history/clouds_history/

[277] Curtis Roads, Microsound (MIT Press). https://monoskop.org/images/d/d1/Roads_Curtis_Microsound.pdf

[278] Curtis Roads, Architecture for Real-Time Granular Synthesis (CMJ). https://www.curtisroads.net/s/7-RoadsKilgoreDuPlessis-CMJ-copy.pdf

[279] MusicTech; Synth Anatomy. https://musictech.com/news/gear/izotope-discontinues-iris2-breaktweaker-trash-2-plugins/; https://synthanatomy.com/2022/10/izotope-discontinues-iris-2-breaktweaker-and-trash-2-plugins.html

[280] Adventures in Synthesis: Emulating the GSX. https://ijc8.me/2020/09/06/emulating-the-gsx/

[282] Josh Stovall, Granular Synthesis: An Overview. https://joshstovall.com/writing/granular-synthesis/

[285] Wikipedia — Concatenative Synthesis. https://en.wikipedia.org/wiki/Concatenative_synthesis

[290] Synth and Software; Plugin Plug. https://synthandsoftware.com/2024/04/arturia-pigments-5-0-polychrome-software-synthesizer-the-synth-and-software-review/; https://pluginplug.io/blog/arturia-pigments-6-new-features

[292] Granular Synthesis Resource Website (hthesis). https://www.granularsynthesis.com/hthesis/sync.html

[299] Morning Dew Media; Synth Anatomy. https://www.morningdewmedia.com/straylight-review-kontakt-library-showcase/; https://synthanatomy.com/2021/08/native-instruments-ashlight-kontakt-granular-instrument-explores-the-dark-side.html

[310] Spectrasonics announcements; Omnisphere manual. https://www.spectrasonics.net/news/news-content.php?id=52; https://www.spectrasonics.net/news/news-content.php?id=112; https://support.spectrasonics.net/manual/Omnisphere2/25/en/topic/layer-page-oscillator-page29

[313] Tralie/Cantil website; Sound on Sound. https://www.ctralie.com/TheConcatenator/; https://www.soundonsound.com/news/concatenator-datamind-audio

[316] Robert Henke's website. https://roberthenke.com/technology/granulator.html

[341] Sound on Sound; Ableton.com. https://www.soundonsound.com/techniques/ableton-live-12-granulator-iii; https://www.ableton.com/en/live/all-new-features/

[346] Ableton Live 12 Release Notes. https://www.ableton.com/en/release-notes/live-12/

[379] arXiv — Neural Granular Sound Synthesis. https://arxiv.org/abs/2008.01393

[388] arXiv — Latent Granular Resynthesis using Neural Audio Codecs. https://arxiv.org/abs/2507.19202

[393] Produce Like A Pro / Understanding Granular Synthesis; Daniele Ghisi PhD thesis. https://producelikeapro.com/blog/understanding-granular-synthesis/; https://www.danieleghisi.com/phd/PHDThesis_20180118.pdf

[425] Iannis Xenakis Organization / Agostino Di Scipio. https://www.iannis-xenakis.org/en/granular-synthesis/

[433] Wikipedia — Granular Synthesis. https://en.wikipedia.org/wiki/Granular_synthesis

[446] Sonarworks blog. https://www.sonarworks.com/blog/learn/whats-the-difference-between-time-stretching-and-ai-voice-manipulation

[447] Lucid Samples. https://www.lucidsamples.com/blog/time-stretching-samples-without-artifacts-advanced-techniques-explained

[448] Carnegie Mellon University, Phase Vocoder Tutorial. https://www.cs.cmu.edu/~music/nyquist/extensions/pvoc/phasevocoder.html

[454] Sound on Sound, INA GRM Tools 3 review. https://www.soundonsound.com/reviews/ina-grm-tools-3

[462] Artists in DSP. https://artistsindsp.com/the-best-15-granular-synthesis-vst-plugins-in-2026/

