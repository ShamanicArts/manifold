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
