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
