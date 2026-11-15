// Adapted from vasiliys961/doctor-opus-global/lib/prompts.ts. Used as a checklist, not as permission to invent findings.
export const MATERNAL_IMAGE_CRITERIA = {
  ecg: {
    title: 'ECG (Advanced Electrophysiology Analysis)',
    requirements: 'EXTRACT ALL METRICS WITH MAXIMUM PRECISION: 1. Technical parameters (Voltage, Speed mm/s). 2. Rhythm (regularity, source), HR. 3. Electrical axis (alpha angle in degrees). 4. Intervals in ms: P-wave (amplitude, duration), PR (interval), QRS (complex), QT/QTc (corrected). 5. Segments: ST (elevation/depression in mm relative to TP baseline, morphology: upsloping, downsloping, horizontal). 6. Waves: Q (pathological: depth >1/4 R), R (progression V1–V6), T (amplitude, polarity, symmetry). 7. Hypertrophy signs (Sokolov-Lyon, Cornell, voltage criteria). 8. Conduction: bundle branch blocks, AV blocks.',
    pathologies: 'Acute Coronary Syndrome (ACS: STEMI, NSTEMI), ischemia localization by leads, arrhythmias (AF, AFL, ectopy, paroxysmal tachycardias), WPW syndrome, Brugada syndrome, PE (McGinn-White S1Q3T3 sign), electrolyte disorders (hyper/hypokalemia: peaked T, U-wave), digoxin toxicity, pericarditis.',
  },
  xray: {
    title: 'X-Ray (Expert Diagnostic Analysis)',
    requirements: '1. Projection and image quality. 2. Chest: Lung fields (lucency, infiltration, nodules), lung roots (structure, width), vascular pattern. 3. Pleural recesses (free/obliterated/fluid). 4. Mediastinum and heart: CTR (cardiothoracic ratio), cardiac contours, aorta. 5. Skeleton: bone integrity, periosteum, joint spaces, vertebral body heights. 6. Soft tissues: gas, foreign bodies.',
    pathologies: 'Pneumonia (lobar, focal), pneumothorax (visceral pleural line), hydrothorax (fluid level), pulmonary edema (Kerley lines), tuberculosis (nodules, cavities), masses (size, margins), fractures, dislocations, degenerative changes (osteophytes, sclerosis).',
  },
  ct: {
    title: 'CT (Computed Tomography Professional Analysis)',
    requirements: '1. Unenhanced and contrast phases (arterial, venous, delayed). 2. Densitometry values (HU density) for all findings. 3. Anatomical localization by segments. 4. Lesion dimensions in 3 projections (mm). 5. Vascular status (stenoses, aneurysms, filling defects). 6. Lymph nodes (short-axis size, structure, number). 7. Free gas and fluid in cavities.',
    pathologies: 'Mass lesions (TNM characteristics), ischemia and hemorrhage zones (acute/chronic), PE (filling defects), aortic aneurysm and dissection, infiltrative changes (ground-glass opacity, consolidation), bone destruction, portal hypertension.',
  },
  mri: {
    title: 'MRI (Magnetic Resonance Imaging Neuro/Body Analysis)',
    requirements: '1. Signal characteristics on all pulse sequences (T1, T2, T2*, FLAIR, DWI, ADC, STIR). 2. Presence and character of diffusion restriction (DWI/ADC mapping). 3. Contrast enhancement pattern. 4. Perifocal changes (edema, gliosis). 5. Mass effect: midline shift (in mm), ventricular/cisternal compression. 6. CSF pathway status. 7. Arteriovenous malformations and vascular anomalies.',
    pathologies: 'Acute stroke (ischemic/hemorrhagic), demyelinating disease (McDonald criteria), tumors (margins, invasion, neoangiogenesis), disc herniations (type, size, neural compression), ligamentous injury, avascular necrosis.',
  },
  ultrasound: {
    title: 'Ultrasound (Expert Analysis + Doppler)',
    requirements: '1. Echogenicity (hyper-, hypo-, an-, iso-echoic) and echotexture. 2. Precise dimensions of organs and lesions (3D). 3. Margins (smooth/irregular, sharp/indistinct). 4. Vascularity on CDS/PD (flow type: peri-, intranodular). 5. Doppler indices (Vmax, Vmin, RI, PI). 6. Free or encapsulated fluid. 7. Specific scales (TI-RADS, BI-RADS, LI-RADS). 8. Regional lymph node status.',
    pathologies: 'Cystic and solid lesions, calculi (size, acoustic shadowing), diffuse parenchymal changes (steatosis, fibrosis), inflammatory signs (wall edema, hypervascularity), vascular thrombosis, portal hypertension.',
  },
  dermatoscopy: {
    title: 'Dermoscopy (Expert Analysis)',
    requirements: '1. Pattern type (reticular, globular, homogeneous). 2. Colors (black, dark/light brown, gray, blue, red, white). 3. ABCDE criteria. 4. Specific features: pigment network (typical/atypical), dots/globules, streaks (radial streaming), blue-white veil, structureless zones. 5. Vascular pattern (dotted, hairpin, arborizing vessels). 6. Argenziano 7-point checklist or Menzies method.',
    pathologies: 'Melanoma (invasive, in situ), Basal Cell Carcinoma (BCC), Squamous Cell Carcinoma (SCC), Dysplastic Nevus, Seborrheic Keratosis, Hemangioma, Dermatofibroma.',
  },
  histology: {
    title: 'Histopathology (Professional Analysis)',
    requirements: '1. Cellular composition and differentiation grade (Grade: G1–G4). 2. Tissue architecture. 3. Nuclear pleomorphism and mitotic activity (mitotic count per HPF). 4. Invasion: depth in mm, penetration of basement membrane, capsule, adjacent organs. 5. Lymphovascular invasion (LVI) and perineural invasion (PNI). 6. Resection margin status (R0, R1, R2). 7. Immunohistochemical markers (IHC: Ki-67, ER, PR, HER2, etc.).',
    pathologies: 'Malignant and benign neoplasms, metastatic involvement, specific inflammation (granulomatosis), dysplastic changes (Low/High grade), atrophy, metaplasia.',
  },
  lab: {
    title: 'Laboratory Diagnostics (In-depth Interpretation)',
    requirements: '1. Trend analysis of values (if available). 2. Interpretation of deviations relative to reference ranges accounting for age and sex. 3. Calculated indices (eGFR by CKD-EPI, HOMA index, De Ritis ratio, Albumin-Globulin ratio). 4. Identification of critical values (Panic values). 5. Assessment of systemic patterns (cytolysis, cholestasis, inflammation, anemia syndrome).',
    pathologies: 'Acute conditions (myocardial infarction by troponins, sepsis by PCT/CRP), electrolyte imbalances, metabolic syndrome, organ failure, hematological shifts (blastemia, leukocyte differential).',
  },
  genetics: {
    title: 'Genetic Analysis (Genomic Interpretation)',
    requirements: '1. Mutation type (missense, nonsense, frameshift, deletion/duplication). 2. Zygosity (homo-/heterozygous). 3. ACMG classification (Pathogenic, Likely Pathogenic, VUS). 4. References to ClinVar, gnomAD, OMIM databases. 5. Predicted phenotype and inheritance risk. 6. Impact on pharmacodynamics/pharmacokinetics (pharmacogenomics).',
    pathologies: 'Monogenic diseases, hereditary cancer syndromes, multifactorial disease predisposition, drug metabolism disorders.',
  },
  mammography: {
    title: 'Mammography (Breast Imaging Expert Analysis)',
    requirements: '1. Breast composition type per ACR (A, B, C, D). 2. Mass characteristics (shape, margins, density). 3. Calcifications: morphology (punctate, pleomorphic), distribution (grouped, linear, segmental). 4. Architectural distortion. 5. Asymmetry. 6. Skin, nipple, and axillary lymph node status. 7. BI-RADS category.',
    pathologies: 'Breast carcinoma (invasive, ductal), benign lesions (fibroadenoma, cysts), sclerosing adenosis, fat necrosis.',
  },
  endoscopy: {
    title: 'Endoscopy (Diagnostic Study Report)',
    requirements: '1. Procedure type and extent reached. 2. Segmental description in insertion order. 3. Lesion location, size in mm, and morphology. 4. Standard scales when supported (Paris, Los Angeles, Forrest, Boston). 5. Biopsies and interventions if visible or stated.',
    pathologies: 'Erosions, ulcers, polyps, bleeding, strictures, inflammation, masses.',
  },
  retinal: {
    title: 'Ophthalmoscopy / Fundus Photo (Retinal Analysis)',
    requirements: '1. Image quality. 2. Optic disc status: margins, color, cupping (C/D ratio). 3. Macular area: foveal reflex, edema, drusen, hard/soft exudates. 4. Vascular bundle: arterial and venous caliber, A/V ratio, AV nicking (Salus-Gunn). 5. Peripheral retina: hemorrhages, microaneurysms, neovascularization zones, detachment.',
    pathologies: 'Diabetic retinopathy (non-proliferative/proliferative), Glaucoma (glaucomatous optic neuropathy), Age-related Macular Degeneration (AMD), Hypertensive retinopathy, Retinal detachment.',
  },
  universal: {
    title: 'Universal Medical Vision Analysis',
    requirements: 'Perform systematic visual search: 1. Anatomical landmarks and symmetry. 2. Focal changes (localization, shape, dimensions in mm, margins). 3. Intensity/density characteristics of the lesion. 4. Relationship with surrounding tissues (invasion, displacement). 5. Presence of fluid, gas, or foreign inclusions.',
    pathologies: 'Any structural anomalies, signs of inflammation, neoplastic processes, traumatic injuries.',
  },
};
