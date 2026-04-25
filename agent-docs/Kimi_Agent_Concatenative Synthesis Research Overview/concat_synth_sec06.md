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
