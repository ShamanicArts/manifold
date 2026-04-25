# Dimension 02: Descriptor Extraction & Feature Spaces for Concatenative Synthesis

A deep research investigation into how sound units are characterized for retrieval and matching in concatenative synthesis, covering low-level descriptors, perceptual descriptors, MPEG-7 standards, deep audio embeddings, dimensionality reduction, and the tension between mathematical and perceptual feature spaces.

---

## 1. FOUNDATIONAL FRAMEWORK: CataRT's DESCRIPTOR-BASED ARCHITECTURE

The contemporary paradigm for concatenative synthesis was established by Diemo Schwarz at IRCAM with the CataRT system, which uses a multidimensional descriptor space as its organizing principle. The system "plays grains from a large corpus of segmented and descriptor-analysed sounds according to proximity to a target position in the descriptor space"[^1^].

### CataRT's Distance Measure: Mahalanobis Distance on Normalized Descriptors

Claim: "The generic distance measure is a Euclidean distance on the two chosen descriptors, normalised over the corpus, i.e. a Mahalanobis distance, in order to avoid distortions between different distances because of the different ranges of the values"[^1^]
Source: Diemo Schwarz, Gregory Beller, Bruno Verbrugghe, Sam Britton — "Real-Time Corpus-Based Concatenative Synthesis with CataRT" (DAFx-06)
URL: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf
Date: 2006
Excerpt: "The selection is considering closeness in a geometric sense, i.e. on appropriately scaled dimensions: The generic distance measure is a Euclidean distance on the two chosen descriptors, normalised over the corpus, i.e. a Mahalanobis distance, in order to avoid distortions between different distances because of the different ranges of the values."
Context: Core unit selection algorithm in CataRT's real-time corpus-based synthesis
Confidence: high

### CataRT's 2D Projection for Interaction

Claim: "Because displaying and navigating in a high-dimensional space is not practical, the descriptor space is reduced to a 2-dimensional projection according to two selectable descriptors"[^2^]
Source: Diemo Schwarz et al. — DAFx-06 paper
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2006
Excerpt: "Because displaying and navigating in a high-dimensional space is not practical, the descriptor space is reduced to a 2-dimensional projection according to two selectable descriptors."
Context: User interface design rationale for CataRT — the 2D projection is interactive and driven by user-selected descriptors
Confidence: high

### CataRT Descriptor Set: MPEG-7 Plus Calculated Descriptors

Claim: "CataRT analyses any number of sound files or live audio by a modular descriptor extraction framework. Batch analysis runs faster than real-time thanks to Gabor's arbitrary rate signal processing in message domain... A total of 230 imported descriptors, such as spectral centroid and loudness"[^3^]
Source: NIME 2012 paper — "Playing Corpus-Based Concatenative Synthesis"
URL: https://www.nime.org/proceedings/2012/nime2012_120.pdf
Date: 2012
Excerpt: "CATART analyses any number of sound files or live audio by a modular descriptor extraction framework... A total of 230 imported descriptors, such as spectral centroid and loudness, enable nuanced analysis of audio data."
Context: CataRT's descriptor extraction imports MPEG-7 low-level descriptors and adds calculated descriptors within the patch
Confidence: high

Claim: "Segmentation and MPEG-7 descriptors are loaded from SDIF files or generated on-the-fly"[^1^]
Source: DAFx-06 paper
URL: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf
Date: 2006
Excerpt: "Segmentation and MPEG-7 descriptors are loaded from SDIF files or generated on-the-fly."
Context: CataRT imports descriptors via SDIF, the standard interchange format developed jointly by IRCAM and CNMAT
Confidence: high

---

## 2. LOW-LEVEL DESCRIPTORS: THE MATHEMATICAL FOUNDATION

### Spectral Descriptors Family

The foundational low-level descriptors for concatenative synthesis derive from the Short-Time Fourier Transform (STFT). The standard set includes:

Claim: "Spectral centroid: A representation of the balancing point of the spectral power distribution within a frame... Spectral Rolloff: A measure of frequency, which is below 95 percentile of the power spectral distribution... Spectral Flux: The 2-norm of the frame-to-frame spectral magnitude difference vector. It measures spectral difference, thus it characterizes the shape changes of the spectrum. Spectral Flatness: A measure of the flatness properties of spectrum within a number frequency bands"[^4^]
Source: Bee Suan Ong et al. — "Semantic Segmentation of Music Audio Contents" (ICMC 2005)
URL: http://mtg.upf.edu/files/publications/9d0455-ICMC2005-beesuan.pdf
Date: 2005
Excerpt: "Spectral Centroid: A representation of the balancing point of the spectral power distribution within a frame. Sub-bands energy... Zero Crossings... Spectral Rolloff... Spectral Flux... Spectral Flatness."
Context: Standard low-level descriptors used for semantic segmentation; same family used in concatenative synthesis
Confidence: high

Claim: "For audio search systems, developers typically extract three categories of features: low-level signal properties, mid-level acoustic characteristics, and high-level semantic descriptors... Frequency-domain features, often derived via STFT, include spectral centroid (brightness), bandwidth, rolloff (high-frequency cutoff), and Mel-Frequency Cepstral Coefficients (MFCCs)"[^5^]
Source: Milvus AI Quick Reference
URL: https://milvus.io/ai-quick-reference/what-features-are-typically-extracted-from-audio-signals-for-search-purposes
Date: 2026-04-21
Excerpt: "Frequency-domain features, often derived via STFT, include spectral centroid (brightness), bandwidth, rolloff (high-frequency cutoff), and Mel-Frequency Cepstral Coefficients (MFCCs)."
Context: Contemporary summary of audio feature extraction for search/retrieval systems
Confidence: high

### MFCC: The Dominant Compact Representation

Claim: "MFCC, also called Mel-Frequency Cepstral Coefficients, a compact representation of an audio spectrum that takes into account the non-linear human perceptual of pitch, as described by the Mel scale"[^4^]
Source: ICMC 2005 paper
URL: http://mtg.upf.edu/files/publications/9d0455-ICMC2005-beesuan.pdf
Date: 2005
Excerpt: "MFCC, also called Mel-Frequency Cepstral Coefficients, a compact representation of an audio spectrum that takes into account the non-linear human perceptual of pitch, as described by the Mel scale."
Context: MFCC is the workhorse descriptor for timbre representation in music retrieval and concatenative synthesis
Confidence: high

Claim: "We choose MFCC features for their efficacy in representing the power spectrum of sounds. 13 MFCC coefficients are extracted with Fast Fourier Transform (FFT) with window size of 1024 samples, and hop size of 512 samples"[^6^]
Source: tiNNbre: a timbre-based musical agent
URL: https://oro.open.ac.uk/79775/1/tiNNbre%20-%20a%20timbre-based%20musical%20agent%20(Bolzoni,%20Di%20Donato,%20Laney).pdf
Date: Unknown (recent)
Excerpt: "We choose MFCC features for their efficacy in representing the power spectrum of sounds. 13 MFCC coefficients are extracted with Fast Fourier Transform (FFT) with window size of 1024 samples, and hop size of 512 samples."
Context: tiNNbre uses MFCCs for neural-network-driven concatenative synthesis via MuBu/CataRT
Confidence: high

Claim: "They found that MFCC yielded better performance than MPEG-7 in most cases. They also pointed out that MPEG-7 descriptors are more computationally demanding to extract than MFCC"[^7^]
Source: Marcelo Caetano et al. — "Audio Content Descriptors of Timbre" (chapter)
URL: https://comma.eecs.qmul.ac.uk/assets/pdf/Caetano_chap11.pdf
Date: Unknown
Excerpt: "They found that MFCC yielded better performance than MPEG-7 in most cases. They also pointed out that MPEG-7 descriptors are more computationally demanding to extract than MFCC."
Context: Comparative evaluation showing MFCCs outperform MPEG-7 descriptors for classification tasks
Confidence: high

---

## 3. MPEG-7 AUDIO DESCRIPTORS: THE STANDARDIZATION EFFORT

### MPEG-7 as a Descriptor Framework

The MPEG-7 multimedia content description interface represented a major standardization effort for audio descriptors, directly informing concatenative synthesis systems.

Claim: "MPEG-7 audio comprises text-based description by category labels, also called semantic tags, and quantitative description using audio content descriptors... Audio content descriptors for MPEG-7 include temporal (i.e., the root-mean-squared energy envelope, zero-crossing rate, temporal centroid, and autocorrelation coefficients), spectral (i.e., centroid, flatness, roll-off, and flux), cepstral (i.e., cepstral coefficients and MFCC), perceptual (i.e., sharpness), and specific descriptors (i.e., odd-to-even harmonic energy ratio, harmonic-noise ratio, and attack time)"[^7^]
Source: Caetano et al. — "Audio Content Descriptors of Timbre"
URL: https://comma.eecs.qmul.ac.uk/assets/pdf/Caetano_chap11.pdf
Date: Unknown
Excerpt: "Audio content descriptors for MPEG-7 include temporal (i.e., the root-mean-squared energy envelope, zero-crossing rate, temporal centroid, and autocorrelation coefficients), spectral (i.e., centroid, flatness, roll-off, and flux), cepstral (i.e., cepstral coefficients and MFCC), perceptual (i.e., sharpness), and specific descriptors."
Context: Comprehensive taxonomy of MPEG-7 audio descriptors used in concatenative synthesis
Confidence: high

### Caterpillar's MPEG-7-Based Descriptor System

Claim: "The descriptors are based on the MPEG-7 low-level descriptor set, plus descriptors derived from the score and the sound class. The low-level descriptors are condensed to unit descriptors by modeling of their temporal evolution over the unit (mean value, slope, spectrum, etc.)"[^8^]
Source: Diemo Schwarz — "Concatenative Sound Synthesis" (survey article)
URL: http://articles.ircam.fr/textes/Schwarz06b/index.pdf
Date: 2006
Excerpt: "The descriptors are based on the MPEG-7 low-level descriptor set, plus descriptors derived from the score and the sound class. The low-level descriptors are condensed to unit descriptors by modeling of their temporal evolution over the unit (mean value, slope, spectrum, etc.)"
Context: Schwarz's Caterpillar system used MPEG-7 descriptors as its base, enriched with score-derived and class descriptors
Confidence: high

Claim: "Caterpillar, first proposed in (Schwarz, 2000, 2003a, 2003b)... performs data-driven concatenative musical sound synthesis from large heterogeneous sound databases... The unit selection algorithm is of the path-search type where a Viterbi algorithm finds the globally optimal sequence of database units that best match the given synthesis target units using two cost functions: The target cost expresses the similarity of a target unit to the database units by weighted Euclidean distance, including a context around the target, and the concatenation cost predicts the quality of the join of two database units"[^8^]
Source: Schwarz — "Concatenative Sound Synthesis"
URL: http://articles.ircam.fr/textes/Schwarz06b/index.pdf
Date: 2006
Excerpt: "The unit selection algorithm is of the path-search type where a Viterbi algorithm finds the globally optimal sequence of database units that best match the given synthesis target units using two cost functions."
Context: Caterpillar's MPEG-7 descriptors fed into a Viterbi path-search unit selection, representing a high-water mark for structured descriptor-based concatenative synthesis
Confidence: high

---

## 4. SDIF: THE SOUND DESCRIPTION INTERCHANGE FORMAT

SDIF is the foundational data exchange standard that enables descriptor portability between analysis, synthesis, and retrieval systems.

Claim: "SDIF stores sound representations: spectral, time domain, and higher-level models. The SDIF standard is in two parts: a specified data format and a set of standard sound descriptions and their official representation. SDIF is a standard proposed by Adrian Freed (CNMAT) and/or Xavier Rodet around 1995, jointly defined by CNMAT and IRCAM, and adopted by the computer music analysis/synthesis community in 1996-97"[^9^]
Source: Matt Wright — "SDIF, the Sound Description Interchange Format"
URL: https://ccrma.stanford.edu/~jos/sasp/hw/SDIF-handout.doc
Date: 2005-05-03
Excerpt: "SDIF is a standard proposed by Adrian Freed (CNMAT) and/or Xavier Rodet around 1995, jointly defined by CNMAT and IRCAM, and adopted by the computer music analysis/synthesis community in 1996-97."
Context: SDIF was jointly developed by IRCAM (Paris), CNMAT (Berkeley), and UPF (Barcelona) as an open binary format
Confidence: high

Claim: "SDIF is an established standard for the well-defined and extensible interchange of a variety of sound descriptions including representations of the signal for analysis-synthesis like spectral, sinusoidal, time-domain, or higher-level models, sound descriptors like loudness or fundamental frequency, markers, labels, and statistical models"[^10^]
Source: SDIF Documentation
URL: https://sdif.sourceforge.net/sdif-documentation.html
Date: 2009-08-11
Excerpt: "SDIF is an established standard for the well-defined and extensible interchange of a variety of sound descriptions including representations of the signal for analysis-synthesis like spectral, sinusoidal, time-domain, or higher-level models, sound descriptors like loudness or fundamental frequency."
Context: SDIF remains the standard for descriptor exchange in concatenative synthesis pipelines
Confidence: high

### SDIF Extensions for Audio Features (2008)

Claim: "We present a set of extensions to the Sound Description Interchange Format (SDIF) for the purpose of storage and/or transmission of general audio descriptors. The aim is to allow portability and interoperability between the feature extraction module of an audio information retrieval application and the remaining modules, such as training, classification or clustering"[^11^]
Source: Burred, Cella, Peeters, Robel, Schwarz — "Using the SDIF Sound Description Interchange Format for Audio Features" (ISMIR 2008)
URL: http://recherche.ircam.fr/anasyn/peeters/ARTICLES/Burred_2008_ISMIR_SDIF.pdf
Date: 2008
Excerpt: "We present a set of extensions to the Sound Description Interchange Format (SDIF) for the purpose of storage and/or transmission of general audio descriptors."
Context: ISMIR 2008 paper extending SDIF to support general audio descriptors for MIR applications
Confidence: high

---

## 5. PERCEPTUAL DESCRIPTORS AND TIMBRE SPACE RESEARCH

### Wessel/Grey Timbre Space: The Foundational Work

The perceptual grounding of descriptor choice for concatenative synthesis traces back to multidimensional scaling (MDS) studies of timbre perception.

Claim: "John M. Grey describes how he applied the multi-dimensional scaling method to data obtained from similarity ratings of the timbres of musical instruments. Based on these ratings, he was able to derive two- and three-dimensional representations of timbre space characterized by the dimensions attack time, centroid and spectral flux"[^12^]
Source: Music Technology Online Repository (MUTOR)
URL: https://mutor-2.github.io/ScienceOfMusic/units/06/
Date: 2025-03-25
Excerpt: "John M. Grey describes how he applied the multi-dimensional scaling method to data obtained from similarity ratings of the timbres of musical instruments. Based on these ratings, he was able to derive two- and three-dimensional representations of timbre space characterized by the dimensions attack time, centroid and spectral flux."
Context: Grey's 1975 work established the canonical dimensions of timbre space that inform descriptor choice
Confidence: high

Claim: "The vertical axis is related to the spectral energy distribution of the tones, and the horizontal, to the nature of the onset transient. The sounds at the top of plot are bright in character, and as one moves towards the bottom the timbres become progressively more mellow"[^13^]
Source: David Wessel — "Timbre Space as a Musical Control Structure"
URL: https://cnmat.berkeley.edu/sites/default/files/attachments/Timbre-Space.pdf
Date: 1979 (published)
Excerpt: "The vertical axis is related to the spectral energy distribution of the tones, and the horizontal, to the nature of the onset transient. The sounds at the top of plot are bright in character."
Context: Wessel's seminal paper argued for timbre space as a musical control structure, directly inspiring descriptor-space navigation in concatenative synthesis
Confidence: high

### McAdams et al.: Quantifying Timbre Dimensions

The work by McAdams, Krimphoff, and Winsberg established quantitative acoustic correlates for perceptual timbre dimensions.

Claim: "Krimphoff et al. (1994) have quantified satisfactorily all three common dimensions of Krumhansl's (1989) model. The first dimension correlated very strongly [r=.94] with the logarithm of the rise time. The second dimension correlated very strongly [r=.94] with the spectral centroid. The third dimension correlated well [r=.85] with a measure of spectral irregularity"[^14^]
Source: McAdams et al. — "Common dimensions, specificities, and latent subject classes"
URL: http://articles.ircam.fr/textes/McAdams95a/
Date: 1995
Excerpt: "The first dimension correlated very strongly [r=.94] with the logarithm of the rise time. The second dimension correlated very strongly [r=.94] with the spectral centroid. The third dimension correlated well [r=.85] with a measure of spectral irregularity."
Context: The three canonical timbre dimensions and their acoustic correlates, directly informing concatenative synthesis descriptor choices
Confidence: high

Claim: "The main four correlates are specified in Equations 5-8 (LAT = log attack time, SC = spectral centroid, SS = spectral smoothness, and SF = spectral flux). Attack time is the time it takes to progress from a threshold energy level to the maximum in the rms amplitude envelope. Spectral centroid is the center of gravity of the long-term amplitude spectrum"[^15^]
Source: Stephen McAdams — "Perspectives on the Contribution of Timbre to Musical Structure"
URL: http://sites.music.columbia.edu/cmc/courses/g6610/fall2011/week4/McAdams-timbre-structure.pdf
Date: Unknown
Excerpt: "The main four correlates are specified in Equations 5-8 (LAT = log attack time, SC = spectral centroid, SS = spectral smoothness, and SF = spectral flux)."
Context: The four primary acoustic correlates used to map perceptual timbre dimensions
Confidence: high

Claim: "In many attempts to model timbre, authors have often chosen descriptors that seem most relevant to them, such as the spectral centroid (related to timbral brightness or nasality), attack time of the energy envelope, spectral variation or flux, and spectral deviation (jaggedness of the spectral fine structure). These vary from study to study making it difficult to compare results across them"[^16^]
Source: McAdams — "The Perceptual Representation of Timbre" (chapter)
URL: https://www.mcgill.ca/mpcl/files/mpcl/mcadams_2019_timbreacoustperceptcogn_ch2.pdf
Date: 2019
Excerpt: "In many attempts to model timbre, authors have often chosen descriptors that seem most relevant to them, such as the spectral centroid (related to timbral brightness or nasality), attack time of the energy envelope, spectral variation or flux, and spectral deviation (jaggedness of the spectral fine structure). These vary from study to study making it difficult to compare results across them."
Context: Critique of the ad-hoc descriptor selection in timbre research, highlighting the need for standardized approaches like the Timbre Toolbox
Confidence: high

---

## 6. PEETERS' LARGE DESCRIPTOR SET AND THE TIMBRE TOOLBOX

### The CUIDADO Project Descriptor Set (2004)

Geoffroy Peeters at IRCAM created one of the most comprehensive descriptor sets for the European CUIDADO project.

Claim: "A large set of audio features for sound description (similarity and classification) in the CUIDADO project"[^17^]
Source: Geoffroy Peeters — IRCAM Technical Report
URL: http://recherche.ircam.fr/anasyn/peeters/ARTICLES/Peeters_2003_cuidadoaudiofeatures.pdf
Date: 2004
Excerpt: "Geoffroy Peeters, 'A large set of audio features for sound description (similarity and classification) in the Cuidado project,' Cuidado project report, IRCAM, 2004."
Context: The CUIDADO descriptor set became the foundation for AudioClas, Freesound's descriptor engine, and influenced the Timbre Toolbox
Confidence: high

The Peeters 2004 descriptor set includes:
- Temporal features: temporal centroid, effective duration
- Energy features: RMS energy, zero-crossing rate, auto-correlation
- Spectral features: centroid, spread, skewness, kurtosis, rolloff, flatness, flux, decrease
- Perceptual features: loudness, sharpness
- Harmonic features: fundamental frequency, inharmonicity, tristimulus, odd/even ratio, harmonic deviation
- MFCC coefficients

### The Timbre Toolbox (2011)

Claim: "The Timbre Toolbox provides a comprehensive set of descriptors that can be useful in perceptual research, as well as in music information retrieval and machine-learning approaches to content-based retrieval in large sound databases... This analysis suggests ten classes of relatively independent audio descriptors, showing that the Timbre Toolbox is a multidimensional instrument for the measurement of the acoustical structure of complex sound signals"[^18^]
Source: Peeters, Giordano, Susini, Misdariis, McAdams — "The Timbre Toolbox: Extracting audio descriptors from musical signals" (JASA)
URL: https://www.mcgill.ca/mpcl/files/mpcl/peeters_2011_jasa.pdf
Date: 2011
Excerpt: "This analysis suggests ten classes of relatively independent audio descriptors, showing that the Timbre Toolbox is a multidimensional instrument for the measurement of the acoustical structure of complex sound signals."
Context: Peer-reviewed publication in Journal of the Acoustical Society of America providing a comprehensive, validated descriptor set
Confidence: high

Claim: "Sound events are first analyzed in terms of various input representations (short-term Fourier transform, harmonic sinusoidal components, an auditory model based on the equivalent rectangular bandwidth concept, the energy envelope). A large number of audio descriptors are then derived from each of these representations to capture temporal, spectral, spectrotemporal, and energetic properties of the sound events"[^18^]
Source: Peeters et al. — JASA 2011
URL: https://www.mcgill.ca/mpcl/files/mpcl/peeters_2011_jasa.pdf
Date: 2011
Excerpt: "Sound events are first analyzed in terms of various input representations (short-term Fourier transform, harmonic sinusoidal components, an auditory model based on the equivalent rectangular bandwidth concept, the energy envelope)."
Context: The Timbre Toolbox uses multiple signal representations (STFT, ERB, Harmonic, TEE) to derive descriptors
Confidence: high

---

## 7. ECRINS: AN AUDIO CONTENT DESCRIPTION ENVIRONMENT

Claim: "The Ecrins system is implemented as a series of Internet/intranet services provided by a server platform located at Ircam... At server side, an application server embeds a series of java servlets... These servlets mainly rely on a relational database, managing all data but audio material itself. In particular, the database contains all metadata and descriptors related data"[^19^]
Source: Remy Mullon et al. — "Ecrins: an audio-content description environment for sound"
URL: http://architexte.ircam.fr/textes/Mullon02a/index.pdf
Date: 2002
Excerpt: "The Ecrins system is implemented as a series of Internet/intranet services provided by a server platform located at Ircam."
Context: ECRINS was IRCAM's web-based system for morphological sound description, combining automatic low-level descriptor calculation with user-driven high-level description
Confidence: high

---

## 8. FTM/GABOR: THE SIGNAL PROCESSING FRAMEWORK

The descriptor extraction in CataRT is built on top of the FTM and Gabor libraries.

Claim: "Gabor provides a novel approach to modular signal processing. It combines various vector based signal processing algorithms in a unified framework using an event processing model... Gabor is based on FTM, an extension of Max/MSP supporting the handling and processing of complex data structures within the Max data flow programming paradigm"[^20^]
Source: Norbert Schnell and Diemo Schwarz — "Gabor, Multi-Representation Real-Time Analysis/Synthesis" (DAFx-05)
URL: https://www.dafx.de/paper-archive/2005/P_122.pdf
Date: 2005
Excerpt: "Gabor is based on FTM, an extension of Max/MSP supporting the handling and processing of complex data structures within the Max data flow programming paradigm."
Context: Gabor uses FTM's `fmat` matrix class to represent spectra, grains, and descriptors, keeping formats close to SDIF specifications
Confidence: high

Claim: "The current version of Gabor supports the following analysis, synthesis and signal processing techniques: Granular synthesis, PSOLA analysis/re-synthesis, Phase vocoder and other STFT based techniques, Sinusoidal analysis/re-synthesis, Convolution, correlation, etc., Estimation of spectral envelopes, Estimation of various audio descriptors"[^20^]
Source: Schnell & Schwarz — DAFx-05
URL: https://www.dafx.de/paper-archive/2005/P_122.pdf
Date: 2005
Excerpt: "The current version of Gabor supports... Estimation of various audio descriptors."
Context: Gabor serves as the real-time descriptor estimation engine for CataRT and other IRCAM tools
Confidence: high

---

## 9. DIMENSIONALITY REDUCTION FOR VISUALIZATION AND NAVIGATION

### PCA, MDS, t-SNE, and UMAP in Audio Applications

Claim: "t-SNE is used to reduce the dimensionality of your N x 39 features matrix to N x 2 (where N is the number of clips). This allows us to use the resulting 2d coordinates as our embedding assignments for the clips"[^21^]
Source: ml4a Audio t-SNE Guide
URL: https://ml4a.github.io/guides/AudioTSNEViewer/
Date: Unknown
Excerpt: "t-SNE is used to reduce the dimensionality of your N x 39 features matrix to N x 2."
Context: The ml4a framework uses MFCC+deltas (39-dimensional) with t-SNE for audio visualization — a direct parallel to CataRT's 2D projection but with modern algorithms
Confidence: high

Claim: "We defined a set of scores that ranked the 'visual quality' of the embedding — a combination of silhouette score and metrics like 'roundness'... UMAP is FAST. TSNE could take 45 minutes to compute, whereas UMAP would just take a couple of minutes"[^22^]
Source: Klustr — "A tool for dimensionality reduction and visualization of large audio datasets"
URL: https://medium.com/@hanoi7/klustr-a-tool-for-dimensionality-reduction-and-visualization-of-large-audio-datasets-c3e958c0856c
Date: 2017-12-31
Excerpt: "UMAP is FAST. TSNE could take 45 minutes to compute, whereas UMAP would just take a couple of minutes to compute the embeddings."
Context: Comparative study of PCA, t-SNE, and UMAP for drum sample visualization; UMAP was orders of magnitude faster
Confidence: high

Claim: "For dimensionality reduction you need features to start with. You can for example extract MFCC's or some other low-level features such as MPEG-7 descriptors. Then you can visualise them using PCA. TBH for this task you might be better of using t-SNE or UMAP to project this high dimensional data while preserving local clusters"[^23^]
Source: Sound Stack Exchange
URL: https://sound.stackexchange.com/questions/48565/dimensionality-reduction-for-visualization-purposes-sound-map
Date: 2020-07-16
Excerpt: "You can for example extract MFCC's or some other low-level features such as MPEG-7 descriptors. Then you can visualise them using PCA."
Context: Practical advice on descriptor-based audio visualization, exactly paralleling concatenative synthesis workflows
Confidence: high

### AudioClas and Freesound's Descriptor Space

Claim: "The sounds are laid out on two dimensions for the user to choose according to the two principal components of freesound's descriptor space of about 170 dimensions calculated by the AudioClas library"[^24^]
Source: Schwarz — "Concatenative Sound Synthesis: The Early Years"
URL: https://hal.science/hal-01161361v1/document
Date: 2006
Excerpt: "The sounds are laid out on two dimensions for the user to choose according to the two principal components of freesound's descriptor space of about 170 dimensions calculated by the AudioClas library."
Context: The Frelia installation used PCA on ~170 AudioClas descriptors to create a 2D navigable space for sound selection — a parallel approach to CataRT using community sound databases
Confidence: high

---

## 10. PERCEPTUAL VS MATHEMATICAL DESCRIPTORS: TENSIONS AND DEBATES

### The Semantic Gap

Claim: "Timbre is a misleadingly simple and exceedingly vague word encompassing a very complex set of auditory attributes, as well as a plethora of intricate psychological and musical issues"[^25^]
Source: Stephen McAdams, cited in Kazazis "Audio Descriptive Synthesis AUDESSY"
URL: http://sonology.org/wp-content/uploads/2019/10/2014M-KazazismEddy.pdf
Date: 2014
Excerpt: "Timbre is a misleadingly simple and exceedingly vague word encompassing a very complex set of auditory attributes."
Context: The fundamental challenge: perceptual categories (bright, warm, harsh, rough) do not map one-to-one onto mathematical descriptors
Confidence: high

### AUDESSY: Mapping Perceptual to Mathematical Descriptors

Claim: "Audio descriptors don't define, rather describe sound... If the analysis model is too general, it will be incapable to reveal any morphology at all. On the other hand, if it is too specific, the essence of what it is assumed to describe might be lost due to highly redundant information"[^25^]
Source: Eddy Kazazis — "Audio Descriptive Synthesis AUDESSY"
URL: http://sonology.org/wp-content/uploads/2019/10/2014M-KazazismEddy.pdf
Date: 2014
Excerpt: "A nice compromise between these two extremes could be made if we build our analysis model by extracting some carefully chosen audio features, which we shall call 'audio descriptors'."
Context: AUDESSY attempts to bridge perceptual semantics (bright, brilliant, warm, rough) with mathematical descriptors via correlation analysis
Confidence: high

Claim: "Bright: Centroid .465*, Spread .463*... Dark: Fundamental Frequency .794**, Centroid -.480*, Spread -.473*... Warm: Fundamental Frequency .69, Odd/Even .73, Spread -.62, Skewness -.66"[^25^]
Source: Kazazis — AUDESSY thesis
URL: http://sonology.org/wp-content/uploads/2019/10/2014M-KazazismEddy.pdf
Date: 2014
Excerpt: "Bright: Centroid .465*, Spread .463*... Warm: Fundamental Frequency .69, Odd/Even .73, Spread -.62"
Context: Correlation matrices showing which mathematical descriptors map to perceptual adjectives — critical for choosing descriptors in concatenative synthesis
Confidence: medium

### Semantic Timbre Categories and Noise-Related Features

Claim: "Random Forest models predicting semantic ratings from audio features outperformed Partial Least-Squares Regression models, consistent with previous results suggesting that non-linear methods are advantageous in timbre semantic predictions using audio features"[^26^]
Source: Reymore et al. — "Modeling Noise-Related Timbre Semantic Categories of Orchestral Instrument Sounds"
URL: https://pmc.ncbi.nlm.nih.gov/articles/PMC9010607/
Date: 2022
Excerpt: "Random Forest models predicting semantic ratings from audio features outperformed Partial Least-Squares Regression models."
Context: Non-linear models better capture the mapping from audio features to perceptual semantics (raspy, harsh, airy) than linear approaches
Confidence: high

Claim: "The median harmonic-to-noise ratio (HNR) was the most important variable in predicting ratings of raspy/grainy/rough; other features related to the relative role of harmonic and stable partials, including inharmonicity and noisiness, were given high RVI values"[^26^]
Source: Reymore et al. — Frontiers in Psychology 2022
URL: https://pmc.ncbi.nlm.nih.gov/articles/PMC9010607/
Date: 2022
Excerpt: "The median harmonic-to-noise ratio (HNR) was the most important variable in predicting ratings of raspy/grainy/rough."
Context: Specific descriptor-to-percept mappings: HNR → raspy, spectral centroid → harsh, odd:even ratio → airy/breathy
Confidence: high

---

## 11. DEEP AUDIO EMBEDDINGS: THE NEXT-GENERATION DESCRIPTORS

### CLAP: Contrastive Language-Audio Pretraining

Claim: "We encode each free-text caption in MusicCaps which results in a fixed sized 512-dimensional embedding... Given an input text prompt, we retrieve the top k most similar captions ranked by Euclidean distance"[^27^]
Source: "A Retrieval Augmented Approach for Text-to-Music Generation" (NLP4MusA 2024)
URL: https://aclanthology.org/2024.nlp4musa-1.6.pdf
Date: 2024
Excerpt: "We first pre-compute a dataset of text embeddings obtained from a contrastive language-audio pre-trained encoder (CLAP)... which results in a fixed sized 512-dimensional embedding."
Context: CLAP embeddings fuse audio and text into a shared semantic space, enabling text-driven audio retrieval
Confidence: high

Claim: "Audio Atlas leverages a contrastive embedding model to generate text-audio embeddings, allowing it to visualize relationships within large-scale audio datasets"[^28^]
Source: Lanzendörfer et al. — "Audio Atlas: Visualizing and Exploring Audio Datasets" (ISMIR 2024)
URL: https://arxiv.org/html/2412.00591v1
Date: 2024-11-30
Excerpt: "To obtain semantically meaningful embeddings, we use CLAP, a contrastive neural network trained on audio-text pairs. This enables Audio Atlas to display audio data with meaningful clusters and facilitates effective semantic searches and content exploration without requiring any audio metadata."
Context: ISMIR 2024 demo using CLAP + t-SNE for audio dataset visualization at scale
Confidence: high

Claim: "Audio Atlas enables users to perform zero-shot classification on their audio data... The CLAP embeddings are used for zero-shot classification with a user-definable list of classes"[^28^]
Source: ISMIR 2024 Audio Atlas paper
URL: https://arxiv.org/html/2412.00591v1
Date: 2024
Excerpt: "Audio Atlas enables users to perform zero-shot classification on their audio data. Zero-shot classification categorizes datasets without prior explicit training on specific classes."
Context: Deep embeddings enable semantic querying without explicit descriptor engineering
Confidence: high

### MERT: Music Understanding with Self-Supervised Representations

Claim: "MERT (Masked music Encoding Representation Transformer) is a self-supervised learning framework for music audio representation learning. It is designed to learn effective and robust music audio representations from large-scale unlabeled music data"[^29^]
Source: Yu et al. — "MERT: Acoustic Music Understanding Model" (arXiv)
URL: https://arxiv.org/pdf/2306.00107
Date: 2023
Excerpt: "We present MERT, a self-supervised learning framework for music audio representation learning. It is designed to learn effective and robust music audio representations from large-scale unlabeled music data."
Context: MERT uses RVQ-VAE acoustic features + CQT teacher for masked language modeling on music, producing general-purpose embeddings
Confidence: high

Claim: "The performance of the MERT model surpasses previous SSL baselines, achieving SOTA or comparable results across a wide range of MIR tasks while using significantly smaller parameter size"[^29^]
Source: Yu et al. — MERT paper
URL: https://arxiv.org/pdf/2306.00107
Date: 2023
Excerpt: "The performance of the MERT model surpasses previous SSL baselines, achieving SOTA or comparable results across a wide range of MIR tasks."
Context: MERT evaluated on 14 downstream MIR tasks from MARBLE benchmark
Confidence: high

### Audio Embedding Landscape for Similarity Search

Claim: "There are a variety of embeddings capturing different features of audio: contrastive language-audio pretraining (CLAP), contrastive learning of musical representations (CLMR), codified audio language modeling (CALM), encodec, music2vec, OpenL3, and VGGish to name a few"[^30^]
Source: "Exploring Musical Roots: Applying Audio Embeddings to Sample-Based Music" (arXiv)
URL: https://arxiv.org/pdf/2401.14542
Date: 2024
Excerpt: "There are a variety of embeddings capturing different features of audio: contrastive language-audio pretraining (CLAP), contrastive learning of musical representations (CLMR), codified audio language modeling (CALM), encodec, music2vec, OpenL3, and VGGish."
Context: The contemporary landscape of deep audio embeddings for music similarity
Confidence: high

Claim: "OpenL3 is a deep audio representation model trained on multimodal datasets, capturing a wide range of audio patterns for tasks like environmental sound recognition and music similarity... YAMNet is a model based on MobileNet, trained on the AudioSet dataset, which classifies and extracts embeddings for over 500 sound categories... VGGish is a deep neural network inspired by VGG, trained on YouTube videos, designed to extract generic audio features"[^31^]
Source: Zilliz — "Scaling Audio Similarity Search with Vector Databases"
URL: https://medium.com/@zilliz_learn/scaling-audio-similarity-search-with-vector-databases-30bccfd70279
Date: 2025-03-05
Excerpt: "OpenL3: A deep audio representation model trained on multimodal datasets... YAMNet: A model based on MobileNet, trained on the AudioSet dataset... VGGish: A deep neural network inspired by VGG, trained on YouTube videos."
Context: Pre-trained embedding models as drop-in replacements for hand-crafted descriptors in audio retrieval systems
Confidence: high

---

## 12. SOUND TEXTURE SAMPLING AND STATISTICAL DESCRIPTOR MODELING

Claim: "We propose two corpus-based methods of statistical modeling of the audio descriptor distribution of texture recordings using histograms and Gaussian mixture models. The models can be interpolated to steer the evolution of the sound texture between different target recordings"[^32^]
Source: Schwarz and Schnell — "Descriptor-based Sound Texture Sampling" (SMC 2010)
URL: http://articles.ircam.fr/textes/Schwarz10a/index.pdf
Date: 2010
Excerpt: "We propose two corpus-based methods of statistical modeling of the audio descriptor distribution of texture recordings using histograms and Gaussian mixture models."
Context: Statistical modeling of descriptor distributions enables steering between textures (e.g., light rain to heavy rain) via descriptor space interpolation
Confidence: high

Claim: "Code is being developed at the moment that adds a third method of statistical modeling by kernel density estimation. The resulting smoothed d-dimensional histogram captures the interdependencies of the descriptors, unlike the separate histogram method"[^32^]
Source: Schwarz & Schnell — SMC 2010
URL: http://articles.ircam.fr/textes/Schwarz10a/index.pdf
Date: 2010
Excerpt: "Code is being developed at the moment that adds a third method of statistical modeling by kernel density estimation."
Context: Future work on modeling descriptor interdependencies for better texture synthesis control
Confidence: high

---

## 13. CURRENT STATE (2024–2026): MODERN DEVELOPMENTS

### CataRT-MuBu: The Current Implementation

Claim: "MuBu (multi-buffer) is a Max toolbox for multimodal analysis of sound and motion, sound synthesis and interactive machine learning. It allows to create interactive gesture-based sonic systems, and it is also the base for the CataRT system for Corpus-based Concatenative Synthesis"[^33^]
Source: IRCAM ISMM — MuBu documentation
URL: https://ircam-ismm.github.io/max-msp/mubu.html
Date: 2025 (updated)
Excerpt: "MuBu is a Max toolbox for multimodal analysis of sound and motion, sound synthesis and interactive machine learning."
Context: CataRT-MuBu is the current actively maintained version of CataRT, distributed via Max Package Manager
Confidence: high

Claim: "CataRT-MuBu is a collection of Max patches for corpus-based concatenative synthesis, audio mosaicing, descriptor analysis, transcription, and composition. Based on MuBu for Max by Norbert Schnell, Riccardo Borghesi, Diemo Schwarz and the ISMM team"[^34^]
Source: GitHub — ircam-ismm/catart-mubu
URL: https://github.com/ircam-ismm/catart-mubu
Date: 2018-01-11 (ongoing)
Excerpt: "CataRT-MuBu is a collection of Max patches for corpus-based concatenative synthesis, audio mosaicing, descriptor analysis, transcription, and composition."
Context: The modern open-source CataRT implementation with MuBu backend supports Max 7+
Confidence: high

### Deep Embeddings Entering Concatenative Practice

Claim: "The choice of audio embedding model can have a large impact on the results... After experimenting with multiple options, we focus on CLAP and CLMR embeddings for this work. These both are state-of-the-art technology as well as produce meaningful similarity in our own analysis in terms of human validated similarity through listening tests"[^30^]
Source: "Exploring Musical Roots" (arXiv 2024)
URL: https://arxiv.org/pdf/2401.14542
Date: 2024
Excerpt: "After experimenting with multiple options, we focus on CLAP and CLMR embeddings for this work."
Context: CLAP and CLMR embeddings validated through listening tests for music similarity — beginning to bridge into concatenative-like applications
Confidence: high

Claim: "By 2026, AI music creation has moved from experimental niche projects to mainstream production workflows, empowering artists to explore new sonic territories"[^35^]
Source: Soundverse — "How Artists Are Using AI and Machine Learning"
URL: https://www.soundverse.ai/blog/article/how-artists-are-using-ai-and-machine-learning-to-create-new-sounds-and-effects-0952
Date: 2026-01-30
Excerpt: "By 2026, AI music creation has moved from experimental niche projects to mainstream production workflows."
Context: Deep audio embeddings are now part of mainstream music production, though not yet directly integrated into most concatenative synthesis systems
Confidence: medium

---

## 14. KEY ACTORS AND STAKEHOLDERS

| Actor | Role | Key Contribution |
|-------|------|-------------------|
| **Diemo Schwarz** (IRCAM) | Creator of CataRT, Caterpillar | Real-time corpus-based concatenative synthesis, descriptor-based unit selection, SDIF extensions[^1^][^8^] |
| **Geoffroy Peeters** (IRCAM) | Descriptor researcher | CUIDADO descriptor set (2004), Timbre Toolbox (2011), MPEG-7 audio standard development[^17^][^18^] |
| **Norbert Schnell** (IRCAM) | FTM/Gabor/MuBu developer | Signal processing framework for descriptor extraction and real-time analysis[^20^][^33^] |
| **David Wessel** (CNMAT/UC Berkeley) | Timbre space pioneer | "Timbre Space as a Musical Control Structure" (1979), SDIF co-development[^13^][^9^] |
| **Stephen McAdams** (McGill) | Perceptual timbre researcher | Quantified acoustic correlates of timbre dimensions with Krimphoff and Winsberg[^14^][^16^] |
| **John Grey** (Stanford/CCRMA) | Timbre space pioneer | MDS studies of musical timbre establishing canonical dimensions[^12^] |
| **Matt Wright / Adrian Freed** (CNMAT) | SDIF co-developers | Sound Description Interchange Format standard[^9^] |
| **Michael Casey / Adam Lindsay** (MPEG-7) | Audio mosaicing pioneers | "Creative abuse" of MPEG-7 for audio mosaics at DAFx 2003[^24^] |

---

## 15. TENSIONS, COUNTER-NARRATIVES, AND DEBATES

### Tension 1: Hand-Crafted vs. Learned Descriptors

There is an active shift from hand-engineered descriptors (spectral centroid, MFCC, etc.) to learned embeddings (CLAP, MERT, VGGish). The trade-off is:
- **Hand-crafted descriptors**: Interpretable, computationally efficient, well-understood perceptual correlates, but limited in capturing high-level semantic concepts
- **Deep embeddings**: Capture rich semantic relationships, enable zero-shot text querying, but are opaque, computationally expensive, and may miss subtle timbral nuances

Claim: "The progression of automated assessment mirrors the broader shift in AI from hand-crafted features to learned representations... The advent of RNNs and Transformers enables a paradigm shift. Instead of relying on pre-defined features, these DL models learn relevant representations directly from raw or lightly processed data"[^36^]
Source: "Recent Advances in Artificial Intelligence for Music Education"
URL: https://media.sciltp.com/articles/2602003085/2602003085.pdf
Date: Unknown
Excerpt: "Instead of relying on pre-defined features, these DL models learn relevant representations directly from raw or lightly processed data."
Context: The broader field is shifting from hand-crafted to learned features, but concatenative synthesis has been slower to adopt due to real-time constraints
Confidence: high

### Tension 2: Perceptual vs. Mathematical Descriptor Choice

Claim: "In many attempts to model timbre, authors have often chosen descriptors that seem most relevant to them, such as the spectral centroid... These vary from study to study making it difficult to compare results across them"[^16^]
Source: McAdams — "The Perceptual Representation of Timbre"
URL: https://www.mcgill.ca/mpcl/files/mpcl/mcadams_2019_timbreacoustperceptcogn_ch2.pdf
Date: 2019
Excerpt: "These vary from study to study making it difficult to compare results across them."
Context: The lack of standardized descriptor selection means different concatenative synthesis systems may produce incompatible results
Confidence: high

### Tension 3: Dimensionality Reduction Fidelity

PCA preserves global structure but loses local neighborhoods. t-SNE preserves local clusters but distorts global structure. UMAP is faster but may not capture subtle timbral relationships. The choice of dimensionality reduction directly affects the navigability of the descriptor space in interactive concatenative synthesis.

Claim: "UMAP and t-SNE will also have parameters such as step amount or perplexity that can be tweaked"[^37^]
Source: Fedden — "Comparative Audio Analysis With Wavenet, MFCCs, UMAP, t-SNE and PCA"
URL: https://medium.com/@LeonFedden/comparative-audio-analysis-with-wavenet-mfccs-umap-t-sne-and-pca-cb8237bfce2f
Date: 2017-11-21
Excerpt: "UMAP and t-SNE will also have parameters such as step amount or perplexity that can be tweaked."
Context: Different dimensionality reduction methods produce different mappings, affecting the interactive experience
Confidence: high

### Tension 4: Real-Time vs. Offline Analysis

CataRT's descriptor extraction must balance accuracy with real-time performance. Modern deep embedding models (CLAP, MERT) typically require GPU acceleration and cannot yet run in real-time within Max/MSP patches, limiting their direct integration into live concatenative performance systems.

---

## 16. HISTORICAL EVOLUTION TIMELINE

| Year | Milestone | Descriptor Dimension |
|------|-----------|---------------------|
| 1975 | Grey's MDS timbre space — attack time, centroid, spectral flux[^12^] | Perceptual |
| 1978 | Wessel "Timbre Space as Musical Control Structure"[^13^] | Perceptual/Control |
| 1995 | McAdams et al. quantify acoustic correlates (LAT, SC, SS, SF)[^14^] | Perceptual-Mathematical bridge |
| 1995–97 | SDIF format developed (Freed/Rodet/Wright)[^9^] | Data interchange |
| 2000 | Caterpillar system — MPEG-7 + score descriptors[^8^] | Low-level + High-level |
| 2002 | ECRINS web-based descriptor environment[^19^] | Metadata + Low-level |
| 2003 | MPEG-7 Audio Mosaics (Casey/Lindsay)[^24^] | MPEG-7 low-level |
| 2004 | Peeters' CUIDADO descriptor set (170+ features)[^17^] | Comprehensive low-level |
| 2005 | FTM/Gabor framework for Max/MSP[^20^] | Real-time extraction |
| 2006 | CataRT real-time concatenative synthesis[^1^] | Interactive 2D navigation |
| 2008 | SDIF extensions for audio features (Burred et al.)[^11^] | Standardization |
| 2010 | Descriptor-based sound texture sampling (Schwarz/Schnell)[^32^] | Statistical modeling |
| 2011 | Timbre Toolbox (Peeters et al., JASA)[^18^] | 10 classes of descriptors |
| 2017 | Audio t-SNE / Klustr (UMAP for audio)[^21^][^22^] | Visualization |
| 2018+ | CataRT-MuBu modern release[^33^][^34^] | MuBu backend |
| 2022 | Semantic timbre modeling with random forests (Reymore et al.)[^26^] | Perceptual semantics |
| 2023 | MERT self-supervised music representations[^29^] | Deep embeddings |
| 2024 | Audio Atlas — CLAP + t-SNE for dataset visualization[^28^] | Semantic navigation |
| 2024 | Retrieval augmented text-to-music with CLAP[^27^] | Text-audio embeddings |

---

## 17. CONCRETE TOOLS AND IMPLEMENTATIONS

| Tool | Type | Descriptor Features | Status |
|------|------|---------------------|--------|
| **CataRT** (IRCAM) | Max/MSP patches | MPEG-7 + calculated, 230 descriptors, Mahalanobis distance[^1^] | Active (as CataRT-MuBu) |
| **Caterpillar** (IRCAM) | Offline system | MPEG-7 + score-derived, Viterbi path-search[^8^] | Research prototype |
| **Timbre Toolbox** (Peeters/McGill) | MATLAB/Python | 10 classes from STFT/ERB/Harmonic/TEE[^18^] | Open source (GitHub) |
| **MuBu** (IRCAM) | Max package | Pitch, timbre, FFT, MFCC, wavelets, statistics[^33^] | Active (Max Package Manager) |
| **Gabor** (IRCAM) | Max externals | Spectral envelopes, various audio descriptors[^20^] | Within FTM distribution |
| **Audio Atlas** (ETH) | Web app | CLAP 512-dim + t-SNE projection[^28^] | Open source (2024) |
| **Freesound/AudioClas** | Web service | ~170 PCA-reduced descriptors[^24^] | Active |
| **tiNNbre** | Max + TensorFlow | MFCC → neural net → CataRT concatenation[^6^] | Research prototype |
| **ECRINS** (IRCAM) | Web service | Low-level + morphological user description[^19^] | Historical |

---

## 18. SUMMARY AND OUTLOOK

The dimension of descriptor extraction and feature spaces for concatenative synthesis has evolved from simple spectral features to comprehensive perceptual descriptor sets, and is now entering a new phase with deep audio embeddings. Key findings:

1. **CataRT established the paradigm**: Mahalanobis distance on normalized descriptors in a 2D projection remains the canonical interactive approach[^1^][^2^]

2. **The descriptor hierarchy is well-established**: Low-level (MFCC, spectral centroid) → perceptual (log attack time, spectral flux) → semantic (bright, rough, warm) — but mappings between layers remain imperfect[^16^][^25^]

3. **Standardization via SDIF and MPEG-7 enabled interoperability**: Though MPEG-7 proved less effective than MFCC for classification, its descriptor taxonomy informed all subsequent systems[^7^][^11^]

4. **The Timbre Toolbox (2011) represents the apex of hand-crafted descriptor engineering**: 10 classes of relatively independent descriptors derived from multiple signal representations[^18^]

5. **Deep embeddings (CLAP, MERT, VGGish, OpenL3) are emerging as next-generation descriptors**: They capture semantic relationships beyond what hand-crafted features can achieve, but real-time integration into live concatenative synthesis remains a challenge[^28^][^29^][^30^]

6. **Dimensionality reduction (PCA, t-SNE, UMAP) is essential for interaction**: The choice of reduction method directly shapes the user's navigational experience[^22^][^28^]

7. **The perceptual-mathematical gap persists**: Verbal descriptors (bright, warm, harsh) map only partially onto mathematical features, and non-linear models (Random Forest) capture these mappings better than linear approaches[^26^]

---

## REFERENCES (Citation Index)

[^1^]: Schwarz et al. — "Real-Time Corpus-Based Concatenative Synthesis with CataRT" (DAFx-06). http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf
[^2^]: Schwarz et al. — DAFx-06 interface section. https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
[^3^]: NIME 2012 — "Playing Corpus-Based Concatenative Synthesis". https://www.nime.org/proceedings/2012/nime2012_120.pdf
[^4^]: Ong et al. — "Semantic Segmentation of Music Audio Contents" (ICMC 2005). http://mtg.upf.edu/files/publications/9d0455-ICMC2005-beesuan.pdf
[^5^]: Milvus — "What features are typically extracted from audio signals". https://milvus.io/ai-quick-reference/what-features-are-typically-extracted-from-audio-signals-for-search-purposes
[^6^]: Bolzoni et al. — "tiNNbre: a timbre-based musical agent". https://oro.open.ac.uk/79775/1/tiNNbre%20-%20a%20timbre-based%20musical%20agent%20(Bolzoni,%20Di%20Donato,%20Laney).pdf
[^7^]: Caetano et al. — "Audio Content Descriptors of Timbre" chapter. https://comma.eecs.qmul.ac.uk/assets/pdf/Caetano_chap11.pdf
[^8^]: Schwarz — "Concatenative Sound Synthesis" survey. http://articles.ircam.fr/textes/Schwarz06b/index.pdf
[^9^]: Wright — "SDIF, the Sound Description Interchange Format". https://ccrma.stanford.edu/~jos/sasp/hw/SDIF-handout.doc
[^10^]: SDIF Documentation. https://sdif.sourceforge.net/sdif-documentation.html
[^11^]: Burred et al. — "Using the SDIF Sound Description Interchange Format for Audio Features" (ISMIR 2008). http://recherche.ircam.fr/anasyn/peeters/ARTICLES/Burred_2008_ISMIR_SDIF.pdf
[^12^]: MUTOR — "Timbre Space as a Musical Control Structure". https://mutor-2.github.io/ScienceOfMusic/units/06/
[^13^]: Wessel — "Timbre Space as a Musical Control Structure". https://cnmat.berkeley.edu/sites/default/files/attachments/Timbre-Space.pdf
[^14^]: McAdams et al. — "Common dimensions, specificities, and latent subject classes". http://articles.ircam.fr/textes/McAdams95a/
[^15^]: McAdams — "Perspectives on the Contribution of Timbre to Musical Structure". http://sites.music.columbia.edu/cmc/courses/g6610/fall2011/week4/McAdams-timbre-structure.pdf
[^16^]: McAdams — "The Perceptual Representation of Timbre". https://www.mcgill.ca/mpcl/files/mpcl/mcadams_2019_timbreacoustperceptcogn_ch2.pdf
[^17^]: Peeters — "A large set of audio features for sound description in the CUIDADO project". http://recherche.ircam.fr/anasyn/peeters/ARTICLES/Peeters_2003_cuidadoaudiofeatures.pdf
[^18^]: Peeters et al. — "The Timbre Toolbox: Extracting audio descriptors from musical signals" (JASA 2011). https://www.mcgill.ca/mpcl/files/mpcl/peeters_2011_jasa.pdf
[^19^]: Mullon et al. — "Ecrins: an audio-content description environment for sound". http://architexte.ircam.fr/textes/Mullon02a/index.pdf
[^20^]: Schnell & Schwarz — "Gabor, Multi-Representation Real-Time Analysis/Synthesis" (DAFx-05). https://www.dafx.de/paper-archive/2005/P_122.pdf
[^21^]: ml4a — Audio t-SNE. https://ml4a.github.io/guides/AudioTSNEViewer/
[^22^]: Klustr — "A tool for dimensionality reduction and visualization of large audio datasets". https://medium.com/@hanoi7/klustr-a-tool-for-dimensionality-reduction-and-visualization-of-large-audio-datasets-c3e958c0856c
[^23^]: Sound Stack Exchange — "Dimensionality reduction for visualization purposes". https://sound.stackexchange.com/questions/48565/dimensionality-reduction-for-visualization-purposes-sound-map
[^24^]: Schwarz — "Concatenative Sound Synthesis: The Early Years". https://hal.science/hal-01161361v1/document
[^25^]: Kazazis — "Audio Descriptive Synthesis AUDESSY". http://sonology.org/wp-content/uploads/2019/10/2014M-KazazismEddy.pdf
[^26^]: Reymore et al. — "Modeling Noise-Related Timbre Semantic Categories" (Frontiers in Psychology 2022). https://pmc.ncbi.nlm.nih.gov/articles/PMC9010607/
[^27^]: "A Retrieval Augmented Approach for Text-to-Music Generation" (NLP4MusA 2024). https://aclanthology.org/2024.nlp4musa-1.6.pdf
[^28^]: Lanzendörfer et al. — "Audio Atlas" (ISMIR 2024). https://arxiv.org/html/2412.00591v1
[^29^]: Yu et al. — "MERT: Acoustic Music Understanding Model". https://arxiv.org/pdf/2306.00107
[^30^]: "Exploring Musical Roots: Applying Audio Embeddings to Sample-Based Music". https://arxiv.org/pdf/2401.14542
[^31^]: Zilliz — "Scaling Audio Similarity Search". https://medium.com/@zilliz_learn/scaling-audio-similarity-search-with-vector-databases-30bccfd70279
[^32^]: Schwarz & Schnell — "Descriptor-based Sound Texture Sampling" (SMC 2010). http://articles.ircam.fr/textes/Schwarz10a/index.pdf
[^33^]: IRCAM ISMM — MuBu documentation. https://ircam-ismm.github.io/max-msp/mubu.html
[^34^]: GitHub — ircam-ismm/catart-mubu. https://github.com/ircam-ismm/catart-mubu
[^35^]: Soundverse — "How Artists Are Using AI". https://www.soundverse.ai/blog/article/how-artists-are-using-ai-and-machine-learning-to-create-new-sounds-and-effects-0952
[^36^]: "Recent Advances in AI for Music Education". https://media.sciltp.com/articles/2602003085/2602003085.pdf
[^37^]: Fedden — "Comparative Audio Analysis". https://medium.com/@LeonFedden/comparative-audio-analysis-with-wavenet-mfccs-umap-t-sne-and-pca-cb8237bfce2f

---

*Research compiled: April 2026*
*Searches conducted: 21 independent web queries covering academic papers, institutional repositories, and authoritative sources*
