/**
 * Built-in educational scenario catalog. The `pallet-processing` scenario
 * is the reference: it extracts the current machining cycle, so the
 * existing demonstration remains available.
 */

import type { LocalizedText, ScenarioActivity, ScenarioDefinition } from './types'
import { SCENARIO_SCHEMA_VERSION, SCENARIO_STAGE_EVENT } from './types'
import { WORKFLOW_PALLET_COMPLETE_EVENT, WORKFLOW_PHASE_EVENT, WORKFLOW_RUN_STATE_EVENT } from './workflowEvents'

function t(en: string, fr: string, de: string): LocalizedText {
  return { en, fr, de }
}

function phaseActivity(id: string, title: LocalizedText, instruction: LocalizedText, phase: string): ScenarioActivity {
  return { id, title, instruction, expectedEvent: { type: WORKFLOW_PHASE_EVENT, match: { phase } } }
}

/**
 * S67: one timed, inspectable process stage. Its event carries the stable
 * `stageId` so the deterministic process scheduler and the visual reducer agree
 * on the stage without relying on localized text.
 */
function stage(
  id: string,
  stageId: string,
  durationSeconds: number,
  title: LocalizedText,
  instruction: LocalizedText,
  flags: { faultPoint?: boolean; recoveryPoint?: boolean } = {},
): ScenarioActivity {
  return {
    id,
    stageId,
    durationSeconds,
    title,
    instruction,
    ...(flags.faultPoint ? { faultPoint: true } : {}),
    ...(flags.recoveryPoint ? { recoveryPoint: true } : {}),
    expectedEvent: { type: SCENARIO_STAGE_EVENT, match: { stage: stageId } },
  }
}

/** S67: terminal process stage whose event is the scenario's completion event. */
function terminal(
  id: string,
  durationSeconds: number,
  title: LocalizedText,
  instruction: LocalizedText,
  eventType: string,
): ScenarioActivity {
  return { id, durationSeconds, title, instruction, expectedEvent: { type: eventType } }
}

/** S67: explicit operator acknowledgement consumed by `recover()`. */
function acknowledgement(): ScenarioActivity {
  return {
    id: 'recovery',
    durationSeconds: 0.4,
    title: t('Confirm outcome', 'Confirmer le résultat', 'Ergebnis bestätigen'),
    instruction: t(
      'Confirm the simulated result and complete the exercise.',
      'Confirmez le résultat simulé et terminez l’exercice.',
      'Bestätigen Sie das Simulationsergebnis und schließen Sie die Übung ab.',
    ),
    expectedEvent: { type: 'scenario.recovered' },
  }
}

interface ProcessScenarioOptions {
  id: string
  title: LocalizedText
  level: 'intermediate' | 'advanced'
  faultInjections?: import('../faults/types').FaultType[]
  stages: ScenarioActivity[]
  successCriteria: LocalizedText[]
  instructorNotes: LocalizedText
  explanation: LocalizedText
}

/**
 * S67 material-flow scenario builder. Activities are the declared ordered
 * process stages plus the explicit acknowledgement; timing is simulation-clock
 * driven by `scenarioProcess.ts`.
 */
function processScenario(options: ProcessScenarioOptions): ScenarioDefinition {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: options.id,
    title: options.title,
    level: options.level,
    prerequisites: [],
    faultInjections: options.faultInjections ?? [],
    learningObjectives: [t('Run the declared simulated cell process.', 'Exécuter le procédé simulé déclaré.', 'Den deklarierten simulierten Zellenprozess ausführen.')],
    activities: [...options.stages, acknowledgement()],
    successCriteria: options.successCriteria,
    instructorNotes: options.instructorNotes,
    explanation: options.explanation,
  }
}

const SIMULATED_TRAINING_NOTE = t(
  'All observed data is simulated training data, not real machine data.',
  'Toutes les données observées sont des données de formation simulées, pas des données machine réelles.',
  'Alle beobachteten Daten sind simulierte Trainingsdaten, keine echten Maschinendaten.',
)

const VISION_INSTRUCTION = t(
  'Follow the simulated part through the declared vision-sorting stage.',
  'Suivez la pièce simulée à travers l’étape déclarée de tri vision.',
  'Verfolgen Sie das simulierte Werkstück durch die deklarierte Bildverarbeitungsstufe.',
)

const PALLETIZING_INSTRUCTION = t(
  'Follow the simulated carton through the declared palletizing stage.',
  'Suivez le carton simulé à travers l’étape déclarée de palettisation.',
  'Verfolgen Sie den simulierten Karton durch die deklarierte Palettierstufe.',
)

const ASSEMBLY_INSTRUCTION = t(
  'Follow the simulated part through the declared assembly stage.',
  'Suivez la pièce simulée à travers l’étape déclarée d’assemblage.',
  'Verfolgen Sie das simulierte Werkstück durch die deklarierte Montagestufe.',
)

const SAFETY_INSTRUCTION = t(
  'Follow the simulated safety sequence; no real machine is affected.',
  'Suivez la séquence de sécurité simulée ; aucune machine réelle n’est concernée.',
  'Verfolgen Sie die simulierte Sicherheitssequenz; es ist keine reale Maschine betroffen.',
)

export const REFERENCE_SCENARIO_ID = 'pallet-processing'

export const SCENARIO_CATALOG: readonly ScenarioDefinition[] = [
  processScenario({
    id: 'sorting-normal-cycle',
    title: t('Vision sorting normal cycle', 'Cycle normal de tri vision', 'Normalzyklus Bildverarbeitung'),
    level: 'intermediate',
    stages: [
      stage('part-enters', 'vision-part-enters', 0.8, t('Part enters', 'Entrée de la pièce', 'Werkstück läuft ein'), VISION_INSTRUCTION),
      stage('sensor-detects', 'vision-sensor-detects', 0.5, t('Sensor detects', 'Détection capteur', 'Sensor erkennt'), VISION_INSTRUCTION),
      stage('conveyor-advances', 'vision-conveyor-advances', 1.0, t('Conveyor advances', 'Avance du convoyeur', 'Förderband transportiert'), VISION_INSTRUCTION),
      stage('inspection-begins', 'vision-inspection-begins', 1.0, t('Inspection begins', 'Début du contrôle', 'Prüfung beginnt'), VISION_INSTRUCTION),
      stage('classification', 'vision-classified', 0.6, t('Classification', 'Classification', 'Klassifizierung'), VISION_INSTRUCTION),
      stage('diverter-actuates', 'vision-diverter-actuates', 0.5, t('Diverter actuates', 'Actionnement de l’aiguillage', 'Weiche betätigt'), VISION_INSTRUCTION),
      stage('part-routes', 'vision-part-routes', 0.8, t('Part routes', 'Acheminement de la pièce', 'Werkstück wird geleitet'), VISION_INSTRUCTION),
      terminal('cycle-completes', 0.6, t('Cycle completes', 'Fin du cycle', 'Zyklus abgeschlossen'), VISION_INSTRUCTION, 'sorting.complete'),
    ],
    successCriteria: [t('Every declared simulated sorting stage completed.', 'Chaque étape simulée de tri déclarée a été terminée.', 'Jede deklarierte simulierte Sortierstufe wurde abgeschlossen.')],
    instructorNotes: SIMULATED_TRAINING_NOTE,
    explanation: t('A vision sorting cycle is a timed sequence of stages, from part entry to routing, not a single instant.', 'Un cycle de tri vision est une séquence d’étapes minutée, de l’entrée au routage, pas un instant unique.', 'Ein Bildverarbeitungs-Sortierzyklus ist eine zeitliche Abfolge von Stufen, vom Einlauf bis zum Weitertransport.'),
  }),
  processScenario({
    id: 'sorting-jam-recovery',
    title: t('Vision sorting jam recovery', 'Récupération bourrage de tri', 'Sortier-Stau Wiederherstellung'),
    level: 'advanced',
    faultInjections: ['conveyor-blockage'],
    stages: [
      stage('conveyor-advances', 'vision-conveyor-advances', 0.8, t('Conveyor advances', 'Avance du convoyeur', 'Förderband transportiert'), VISION_INSTRUCTION),
      stage('jam-detected', 'vision-jam-detected', 0.6, t('Jam detected', 'Bourrage détecté', 'Stau erkannt'), VISION_INSTRUCTION, { faultPoint: true }),
      stage('operator-acknowledged', 'vision-operator-acknowledged', 0.6, t('Operator acknowledgement', 'Acquittement opérateur', 'Bedienerquittierung'), VISION_INSTRUCTION, { recoveryPoint: true }),
      stage('jam-cleared', 'vision-jam-cleared', 0.8, t('Jam cleared', 'Bourrage dégagé', 'Stau behoben'), VISION_INSTRUCTION),
      stage('diverter-actuates', 'vision-diverter-actuates', 0.5, t('Diverter actuates', 'Actionnement de l’aiguillage', 'Weiche betätigt'), VISION_INSTRUCTION),
      terminal('part-routes-reject', 0.8, t('Part routes to reject', 'Acheminement vers le rebut', 'Werkstück wird ausgeschleust'), VISION_INSTRUCTION, 'sorting.recovered'),
    ],
    successCriteria: [t('The simulated jam was acknowledged, cleared and routed to the reject lane.', 'Le bourrage simulé a été acquitté, dégagé et acheminé vers la voie de rebut.', 'Der simulierte Stau wurde quittiert, behoben und auf die Ausschleusbahn geleitet.')],
    instructorNotes: SIMULATED_TRAINING_NOTE,
    explanation: t('A jam interrupts the process at detection; recovery resumes from the defined acknowledgement point without skipping the clearing stages.', 'Un bourrage interrompt le procédé à la détection ; la récupération reprend au point d’acquittement défini sans sauter les étapes de dégagement.', 'Ein Stau unterbricht den Prozess bei der Erkennung; die Wiederherstellung beginnt am definierten Quittierungspunkt, ohne Stufen zu überspringen.'),
  }),
  processScenario({
    id: 'palletizing-normal-cycle',
    title: t('Palletizing normal cycle', 'Cycle normal de palettisation', 'Normalzyklus Palettierung'),
    level: 'intermediate',
    stages: [
      stage('part-available', 'palletizing-part-available', 0.8, t('Part available', 'Pièce disponible', 'Werkstück verfügbar'), PALLETIZING_INSTRUCTION),
      stage('robot-approach', 'palletizing-robot-approach', 1.0, t('Robot approach', 'Approche du robot', 'Roboter fährt an'), PALLETIZING_INSTRUCTION),
      stage('gripper-on', 'palletizing-gripper-on', 0.5, t('Gripper on', 'Ventouse activée', 'Greifer ein'), PALLETIZING_INSTRUCTION),
      stage('pick', 'palletizing-pick', 0.7, t('Pick', 'Prise', 'Aufnehmen'), PALLETIZING_INSTRUCTION),
      stage('transfer', 'palletizing-transfer', 1.0, t('Transfer', 'Transfert', 'Transfer'), PALLETIZING_INSTRUCTION),
      stage('place', 'palletizing-place', 0.7, t('Place', 'Pose', 'Ablegen'), PALLETIZING_INSTRUCTION),
      stage('gripper-off', 'palletizing-gripper-off', 0.5, t('Gripper off', 'Ventouse désactivée', 'Greifer aus'), PALLETIZING_INSTRUCTION),
      stage('layer-update', 'palletizing-layer-update', 0.5, t('Layer update', 'Mise à jour de couche', 'Lage aktualisiert'), PALLETIZING_INSTRUCTION),
      terminal('cycle-completes', 0.6, t('Cycle completes', 'Fin du cycle', 'Zyklus abgeschlossen'), PALLETIZING_INSTRUCTION, 'palletizing.complete'),
    ],
    successCriteria: [t('Every declared simulated palletizing stage completed.', 'Chaque étape simulée de palettisation déclarée a été terminée.', 'Jede deklarierte simulierte Palettierstufe wurde abgeschlossen.')],
    instructorNotes: SIMULATED_TRAINING_NOTE,
    explanation: t('Palletizing is a timed pick, transfer, place and layer-update sequence; each stage is separately observable.', 'La palettisation est une séquence minutée de prise, transfert, pose et mise à jour de couche ; chaque étape est observable séparément.', 'Palettieren ist eine zeitliche Folge aus Aufnehmen, Transfer, Ablegen und Lageaktualisierung; jede Stufe ist einzeln beobachtbar.'),
  }),
  processScenario({
    id: 'palletizing-vacuum-recovery',
    title: t('Palletizing vacuum recovery', 'Récupération perte de vide', 'Vakuumverlust Wiederherstellung'),
    level: 'advanced',
    faultInjections: ['communication-loss'],
    stages: [
      stage('part-available', 'palletizing-part-available', 0.8, t('Part available', 'Pièce disponible', 'Werkstück verfügbar'), PALLETIZING_INSTRUCTION),
      stage('vacuum-loss', 'palletizing-vacuum-loss', 0.6, t('Vacuum loss', 'Perte de vide', 'Vakuumverlust'), PALLETIZING_INSTRUCTION, { faultPoint: true }),
      stage('operator-acknowledged', 'palletizing-operator-acknowledged', 0.6, t('Operator acknowledgement', 'Acquittement opérateur', 'Bedienerquittierung'), PALLETIZING_INSTRUCTION, { recoveryPoint: true }),
      stage('vacuum-restored', 'palletizing-vacuum-restored', 0.8, t('Vacuum restored', 'Vide rétabli', 'Vakuum wiederhergestellt'), PALLETIZING_INSTRUCTION),
      stage('layer-update', 'palletizing-layer-update', 0.5, t('Layer update', 'Mise à jour de couche', 'Lage aktualisiert'), PALLETIZING_INSTRUCTION),
      terminal('cycle-completes', 0.6, t('Cycle completes', 'Fin du cycle', 'Zyklus abgeschlossen'), PALLETIZING_INSTRUCTION, 'palletizing.recovered'),
    ],
    successCriteria: [t('The simulated vacuum loss was acknowledged, restored and the layer completed.', 'La perte de vide simulée a été acquittée, rétablie et la couche terminée.', 'Der simulierte Vakuumverlust wurde quittiert, wiederhergestellt und die Lage abgeschlossen.')],
    instructorNotes: SIMULATED_TRAINING_NOTE,
    explanation: t('A vacuum loss interrupts the pick/transfer stage; recovery resumes from the acknowledgement point and completes the required stage transitions.', 'Une perte de vide interrompt l’étape prise/transfert ; la récupération reprend au point d’acquittement et termine les étapes requises.', 'Ein Vakuumverlust unterbricht die Aufnahme-/Transferstufe; die Wiederherstellung beginnt am Quittierungspunkt und schließt die erforderlichen Stufen ab.'),
  }),
  processScenario({
    id: 'assembly-inspection-cycle',
    title: t('Assembly and inspection', 'Assemblage et contrôle', 'Montage und Prüfung'),
    level: 'intermediate',
    stages: [
      stage('part-available', 'assembly-part-available', 0.8, t('Part available', 'Pièce disponible', 'Werkstück verfügbar'), ASSEMBLY_INSTRUCTION),
      stage('robot-load', 'assembly-robot-load', 1.0, t('Robot load', 'Chargement robot', 'Roboter lädt'), ASSEMBLY_INSTRUCTION),
      stage('fixture-clamp', 'assembly-fixture-clamp', 0.6, t('Fixture clamp', 'Bridage du montage', 'Vorrichtung spannen'), ASSEMBLY_INSTRUCTION),
      stage('assembly', 'assembly-process', 1.0, t('Assembly', 'Assemblage', 'Montage'), ASSEMBLY_INSTRUCTION),
      stage('inspection', 'assembly-inspection', 0.8, t('Inspection', 'Contrôle', 'Prüfung'), ASSEMBLY_INSTRUCTION),
      stage('decision', 'assembly-decision-accept', 0.5, t('Accept / rework decision', 'Décision accepté / retouche', 'Entscheidung Gut / Nacharbeit'), ASSEMBLY_INSTRUCTION),
      stage('unclamp', 'assembly-unclamp', 0.5, t('Unclamp', 'Débridage', 'Vorrichtung lösen'), ASSEMBLY_INSTRUCTION),
      terminal('cycle-completes', 0.6, t('Cycle completes', 'Fin du cycle', 'Zyklus abgeschlossen'), ASSEMBLY_INSTRUCTION, 'assembly.complete'),
    ],
    successCriteria: [t('Every declared simulated assembly stage completed.', 'Chaque étape simulée d’assemblage déclarée a été terminée.', 'Jede deklarierte simulierte Montagestufe wurde abgeschlossen.')],
    instructorNotes: SIMULATED_TRAINING_NOTE,
    explanation: t('Assembly is a timed load, clamp, process, inspect, decide and unclamp sequence; the decision stage is explicit.', 'L’assemblage est une séquence minutée de chargement, bridage, process, contrôle, décision et débridage ; l’étape de décision est explicite.', 'Montage ist eine zeitliche Folge aus Laden, Spannen, Prozess, Prüfen, Entscheiden und Lösen; die Entscheidungsstufe ist explizit.'),
  }),
  processScenario({
    id: 'safety-door-recovery',
    title: t('Safety door recovery', 'Récupération porte de sécurité', 'Sicherheitstür Wiederherstellung'),
    level: 'advanced',
    faultInjections: ['collision-risk'],
    stages: [
      stage('unsafe-state', 'safety-unsafe-state', 0.8, t('Unsafe state', 'État dangereux', 'Unsicherer Zustand'), SAFETY_INSTRUCTION),
      stage('detection', 'safety-detection', 0.6, t('Interlock / scanner detection', 'Détection interverrouillage / scanner', 'Verriegelungs-/Scannererkennung'), SAFETY_INSTRUCTION),
      stage('motion-inhibited', 'safety-motion-inhibited', 0.6, t('Motion inhibited', 'Mouvement inhibé', 'Bewegung gesperrt'), SAFETY_INSTRUCTION, { faultPoint: true }),
      stage('operator-acknowledged', 'safety-operator-acknowledged', 0.6, t('Operator acknowledgement', 'Acquittement opérateur', 'Bedienerquittierung'), SAFETY_INSTRUCTION, { recoveryPoint: true }),
      stage('safe-state-restored', 'safety-state-restored', 0.8, t('Safe state restored', 'État sûr rétabli', 'Sicherer Zustand wiederhergestellt'), SAFETY_INSTRUCTION),
      terminal('controlled-restart', 0.5, t('Controlled restart', 'Redémarrage contrôlé', 'Kontrollierter Neustart'), SAFETY_INSTRUCTION, 'safety.restarted'),
    ],
    successCriteria: [t('The simulated unsafe state was acknowledged, restored and restarted in a controlled way.', 'L’état dangereux simulé a été acquitté, rétabli et redémarré de façon contrôlée.', 'Der simulierte unsichere Zustand wurde quittiert, wiederhergestellt und kontrolliert neu gestartet.')],
    instructorNotes: SIMULATED_TRAINING_NOTE,
    explanation: t('The exercise starts from a simulated unsafe condition; motion is inhibited until the acknowledgement restores the safe state and performs a controlled restart. This is simulated training behaviour and is not certified.', 'L’exercice démarre dans une condition dangereuse simulée ; le mouvement est inhibé jusqu’à ce que l’acquittement rétablisse l’état sûr et effectue un redémarrage contrôlé. Comportement de formation simulé, non certifié.', 'Die Übung startet aus einem simulierten unsicheren Zustand; die Bewegung ist gesperrt, bis die Quittierung den sicheren Zustand wiederherstellt und einen kontrollierten Neustart ausführt. Simuliertes Trainingsverhalten, nicht zertifiziert.'),
  }),
  {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: 'robot-axes',
    title: t('Robot axes', 'Axes du robot', 'Roboterachsen'),
    level: 'beginner',
    learningObjectives: [
      t('Identify the six revolute axes of the arm.', 'Identifier les six axes rotatifs du bras.', 'Die sechs Drehachsen des Arms erkennen.'),
      t('Recognise which axes move in each machining phase.', 'Reconnaître quels axes bougent à chaque phase d’usinage.', 'Erkennen, welche Achsen in jeder Bearbeitungsphase bewegt werden.'),
    ],
    prerequisites: [],
    activities: [
      phaseActivity('base-rotation', t('Base rotation', 'Rotation de base', 'Basis-Drehung'), t('Watch axis 1 turn the arm to the pallet.', 'Observez l’axe 1 orienter le bras vers la palette.', 'Beobachten Sie, wie Achse 1 den Arm zur Palette dreht.'), 'SELECT_NEXT_SLOT'),
      phaseActivity('shoulder', t('Shoulder and elbow', 'Épaule et coude', 'Schulter und Ellbogen'), t('Watch axes 2 and 3 lower the arm above a slot.', 'Observez les axes 2 et 3 abaisser le bras au-dessus d’un alvéole.', 'Beobachten Sie, wie die Achsen 2 und 3 den Arm über einen Slot senken.'), 'MOVE_ABOVE_PALLET_SLOT'),
      phaseActivity('wrist', t('Wrist orientation', 'Orientation du poignet', 'Handgelenk-Orientierung'), t('Watch the wrist orient the gripper to pick the part.', 'Observez le poignet orienter la pince pour saisir la pièce.', 'Beobachten Sie, wie das Handgelenk den Greifer zum Aufnehmen ausrichtet.'), 'PICK_PART'),
      phaseActivity('carry', t('Carrying the part', 'Transport de la pièce', 'Transport des Werkstücks'), t('Watch the arm carry the part toward the CNC.', 'Observez le bras transporter la pièce vers le CNC.', 'Beobachten Sie, wie der Arm das Werkstück zur CNC trägt.'), 'MOVE_TO_CNC_APPROACH'),
      phaseActivity('complete', t('Cycle complete', 'Cycle terminé', 'Zyklus abgeschlossen'), t('Wait until the run finishes.', 'Attendez la fin du cycle.', 'Warten Sie, bis der Zyklus endet.'), 'COMPLETE'),
    ],
    successCriteria: [t('All six axes were observed moving.', 'Les six axes ont été observés en mouvement.', 'Alle sechs Achsen wurden in Bewegung beobachtet.')],
    instructorNotes: t('Highlight axis 1 (yaw), axes 2/3 (pitch), and the wrist axes 4-6 during each phase.', 'Soulignez l’axe 1 (lacet), les axes 2/3 (tangage) et le poignet (axes 4-6).', 'Heben Sie Achse 1 (Gieren), Achsen 2/3 (Nicken) und das Handgelenk (Achsen 4-6) hervor.'),
    explanation: t('The arm uses six joints to position the gripper. Watch how each joint contributes to the movement.', 'Le bras utilise six articulations pour positionner la pince. Observez la contribution de chaque articulation.', 'Der Arm nutzt sechs Gelenke, um den Greifer zu positionieren. Beobachten Sie den Beitrag jedes Gelenks.'),
  },
  {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: 'coordinate-frames',
    title: t('Coordinate frames', 'Repères de coordonnées', 'Koordinatensysteme'),
    level: 'beginner',
    learningObjectives: [
      t('Explain the world and cell frames.', 'Expliquer le repère monde et le repère cellule.', 'Welt- und Zellkoordinatensystem erklären.'),
      t('Relate work-object frames to the pallet and the CNC.', 'Relier les repères d’objet de travail à la palette et au CNC.', 'Werkstück-Koordinatensysteme mit Palette und CNC verknüpfen.'),
    ],
    prerequisites: ['robot-axes'],
    activities: [
      phaseActivity('world', t('World frame', 'Repère monde', 'Weltkoordinatensystem'), t('Notice the robot base sits at the cell origin.', 'Remarquez que la base du robot est à l’origine de la cellule.', 'Beachten Sie, dass die Roboterbasis im Zellursprung steht.'), 'SELECT_NEXT_SLOT'),
      phaseActivity('pallet-frame', t('Pallet work object', 'Objet de travail palette', 'Paletten-Werkstück'), t('The pallet defines its own work-object frame above the conveyor.', 'La palette définit son propre repère d’objet de travail au-dessus du convoyeur.', 'Die Palette definiert ihr eigenes Werkstück-System über dem Förderband.'), 'MOVE_ABOVE_PALLET_SLOT'),
      phaseActivity('cnc-frame', t('CNC work object', 'Objet de travail CNC', 'CNC-Werkstück'), t('The CNC frame is fixed in front of the robot.', 'Le repère CNC est fixé devant le robot.', 'Das CNC-System ist vor dem Roboter fixiert.'), 'MOVE_TO_CNC_APPROACH'),
      phaseActivity('complete', t('Cycle complete', 'Cycle terminé', 'Zyklus abgeschlossen'), t('Wait until the run finishes.', 'Attendez la fin du cycle.', 'Warten Sie, bis der Zyklus endet.'), 'COMPLETE'),
    ],
    successCriteria: [t('World, pallet and CNC frames were observed.', 'Les repères monde, palette et CNC ont été observés.', 'Welt-, Paletten- und CNC-System wurden beobachtet.')],
    instructorNotes: t('Point out the three frames on the kinematics overlay.', 'Montrez les trois repères sur la superposition de cinématique.', 'Zeigen Sie die drei Systeme auf dem Kinematik-Overlay.'),
    explanation: t('Every tool position is expressed in a frame. The world frame is the cell, and work objects add local frames.', 'Chaque position d’outil est exprimée dans un repère. Le monde est la cellule et les objets de travail ajoutent des repères locaux.', 'Jede Werkzeugposition wird in einem System ausgedrückt. Die Welt ist die Zelle, Werkstücke fügen lokale Systeme hinzu.'),
  },
  {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: 'pick-and-place',
    title: t('Pick and place', 'Prise et pose', 'Greifen und Ablegen'),
    level: 'intermediate',
    learningObjectives: [
      t('Perform a full pick of a raw part.', 'Réaliser une prise complète d’une pièce brute.', 'Ein Rohteil vollständig aufnehmen.'),
      t('Return the machined part to its slot.', 'Remettre la pièce usinée dans son alvéole.', 'Das bearbeitete Werkstück in seinen Slot zurücklegen.'),
    ],
    prerequisites: ['robot-axes', 'coordinate-frames'],
    activities: [
      phaseActivity('select-slot', t('Select slot', 'Sélection de l’alvéole', 'Slot wählen'), t('Watch the arm move above the first raw slot.', 'Observez le bras au-dessus du premier alvéole brut.', 'Beobachten Sie den Arm über dem ersten Rohteil-Slot.'), 'SELECT_NEXT_SLOT'),
      phaseActivity('pick', t('Pick the part', 'Saisir la pièce', 'Werkstück greifen'), t('Watch the gripper descend and grip the part.', 'Observez la pince descendre et saisir la pièce.', 'Beobachten Sie, wie der Greifer absenkt und das Werkstück greift.'), 'PICK_PART'),
      phaseActivity('lift', t('Lift the part', 'Soulever la pièce', 'Werkstück anheben'), t('Watch the arm lift the part away from the pallet.', 'Observez le bras soulever la pièce de la palette.', 'Beobachten Sie, wie der Arm das Werkstück von der Palette hebt.'), 'LIFT_FROM_PALLET'),
      phaseActivity('place-back', t('Return to slot', 'Retour à l’alvéole', 'Rückkehr zum Slot'), t('Watch the part return to its original slot.', 'Observez la pièce revenir dans son alvéole d’origine.', 'Beobachten Sie, wie das Werkstück in seinen ursprünglichen Slot zurückkehrt.'), 'PLACE_PART_BACK'),
      phaseActivity('complete', t('Pick-and-place done', 'Prise et pose terminées', 'Greifen und Ablegen abgeschlossen'), t('Wait for the pallet cycle to finish.', 'Attendez la fin du cycle de palette.', 'Warten Sie auf das Ende des Palettenzyklus.'), 'COMPLETE'),
    ],
    successCriteria: [t('A part was picked and placed back successfully.', 'Une pièce a été prise et remise avec succès.', 'Ein Werkstück wurde erfolgreich gegriffen und zurückgelegt.')],
    instructorNotes: t('Emphasise approach, grip, lift, and place as distinct motions.', 'Insistez sur l’approche, la prise, le levage et la pose comme mouvements distincts.', 'Heben Sie Anfahren, Greifen, Anheben und Ablegen als getrennte Bewegungen hervor.'),
    explanation: t('Picking and placing combines several motions: approach, grip, lift, carry, and release.', 'La prise et la pose combinent plusieurs mouvements : approche, prise, levage, transport et relâchement.', 'Greifen und Ablegen kombiniert mehrere Bewegungen: Anfahren, Greifen, Anheben, Transport und Loslassen.'),
  },
  {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: 'cnc-loading',
    title: t('CNC loading', 'Chargement CNC', 'CNC-Beladung'),
    level: 'intermediate',
    learningObjectives: [
      t('Approach the CNC door safely.', 'Approcher la porte du CNC en sécurité.', 'Sicher an die CNC-Tür heranfahren.'),
      t('Load a part into the machine and retrieve it after machining.', 'Charger une pièce dans la machine et la retirer après usinage.', 'Ein Werkstück laden und nach der Bearbeitung entnehmen.'),
    ],
    prerequisites: ['pick-and-place'],
    activities: [
      phaseActivity('approach', t('Approach', 'Approche', 'Anfahren'), t('Watch the arm approach the CNC door at a safe height.', 'Observez le bras approcher la porte du CNC en hauteur.', 'Beobachten Sie den Arm in sicherer Höhe auf die CNC-Tür zu.'), 'MOVE_TO_CNC_APPROACH'),
      phaseActivity('insert', t('Insert', 'Insertion', 'Einführen'), t('Watch the tool insert the part through the door.', 'Observez l’outil insérer la pièce par la porte.', 'Beobachten Sie, wie das Werkzeug das Teil durch die Tür einführt.'), 'MOVE_TO_CNC_INSERT'),
      phaseActivity('machine', t('Machining', 'Usinage', 'Bearbeitung'), t('Wait for the CNC to machine the part.', 'Attendez que le CNC usine la pièce.', 'Warten Sie, bis die CNC das Teil bearbeitet.'), 'MACHINING'),
      phaseActivity('retrieve', t('Retrieve', 'Retrait', 'Entnahme'), t('Watch the arm retrieve the machined part.', 'Observez le bras retirer la pièce usinée.', 'Beobachten Sie, wie der Arm das bearbeitete Teil entnimmt.'), 'RETRIEVE_PART'),
      phaseActivity('complete', t('Cycle complete', 'Cycle terminé', 'Zyklus abgeschlossen'), t('Wait until the run finishes.', 'Attendez la fin du cycle.', 'Warten Sie, bis der Zyklus endet.'), 'COMPLETE'),
    ],
    successCriteria: [t('A part was loaded and retrieved from the CNC.', 'Une pièce a été chargée et retirée du CNC.', 'Ein Werkstück wurde geladen und aus der CNC entnommen.')],
    instructorNotes: t('Explain the door wait and why the arm retracts before machining.', 'Expliquez l’attente de la porte et pourquoi le bras recule avant l’usinage.', 'Erklären Sie das Türwarten und warum sich der Arm vor der Bearbeitung zurückzieht.'),
    explanation: t('CNC loading is a safety-sensitive sequence: approach, open door, insert, retract, machine, retrieve.', 'Le chargement CNC est une séquence sensible : approche, ouverture, insertion, retrait, usinage, extraction.', 'Die CNC-Beladung ist eine sicherheitskritische Abfolge: Anfahren, Tür öffnen, einführen, zurückziehen, bearbeiten, entnehmen.'),
  },
  {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id: 'pallet-processing',
    title: t('Complete pallet processing', 'Usinage complet de palette', 'Komplette Palettenbearbeitung'),
    level: 'advanced',
    learningObjectives: [
      t('Process every raw slot on a pallet end to end.', 'Traiter chaque alvéole brut d’une palette de bout en bout.', 'Jeden Rohteil-Slot einer Palette durchgängig bearbeiten.'),
      t('Observe the full pick → CNC → return cycle.', 'Observer le cycle complet prise → CNC → retour.', 'Den vollständigen Greif- → CNC- → Rückgabezyklus beobachten.'),
    ],
    prerequisites: ['pick-and-place', 'cnc-loading'],
    cellTemplateId: 'single-conveyor-machining-cell',
    initialJoints: [0, -0.3, 0.5, 0, 0, 0],
    activities: [
      phaseActivity('select-slot', t('Select slot', 'Sélection de l’alvéole', 'Slot wählen'), t('Watch the first raw slot be selected.', 'Observez la sélection du premier alvéole brut.', 'Beobachten Sie die Auswahl des ersten Rohteil-Slots.'), 'SELECT_NEXT_SLOT'),
      phaseActivity('approach-pallet', t('Approach pallet', 'Approche palette', 'Palette anfahren'), t('Watch the arm move above the slot.', 'Observez le bras au-dessus de l’alvéole.', 'Beobachten Sie den Arm über dem Slot.'), 'MOVE_ABOVE_PALLET_SLOT'),
      phaseActivity('pick', t('Pick part', 'Saisie de la pièce', 'Werkstück greifen'), t('Watch the part be picked.', 'Observez la prise de la pièce.', 'Beobachten Sie das Greifen des Werkstücks.'), 'PICK_PART'),
      phaseActivity('travel-cnc', t('Travel to CNC', 'Déplacement vers CNC', 'Fahrt zur CNC'), t('Watch the arm travel to the CNC.', 'Observez le déplacement vers le CNC.', 'Beobachten Sie die Fahrt zur CNC.'), 'MOVE_TO_CNC_APPROACH'),
      phaseActivity('load-cnc', t('Load CNC', 'Chargement CNC', 'CNC laden'), t('Watch the part be loaded.', 'Observez le chargement de la pièce.', 'Beobachten Sie das Laden des Werkstücks.'), 'LOAD_PART'),
      phaseActivity('machine', t('Machining', 'Usinage', 'Bearbeitung'), t('Wait for machining.', 'Attendez l’usinage.', 'Warten Sie auf die Bearbeitung.'), 'MACHINING'),
      phaseActivity('retrieve-cnc', t('Retrieve from CNC', 'Retrait du CNC', 'Aus der CNC entnehmen'), t('Watch the machined part be retrieved.', 'Observez le retrait de la pièce usinée.', 'Beobachten Sie die Entnahme des bearbeiteten Werkstücks.'), 'RETRIEVE_PART'),
      phaseActivity('return-part', t('Return part', 'Retour de la pièce', 'Werkstück zurücklegen'), t('Watch the part return to its slot.', 'Observez le retour de la pièce dans son alvéole.', 'Beobachten Sie die Rückkehr des Werkstücks in seinen Slot.'), 'PLACE_PART_BACK'),
      {
        id: 'run-complete',
        title: t('Run complete', 'Cycle terminé', 'Lauf abgeschlossen'),
        instruction: t('Wait for the run to complete.', 'Attendez la fin du cycle.', 'Warten Sie auf das Ende des Laufs.'),
        expectedEvent: { type: WORKFLOW_RUN_STATE_EVENT, match: { state: 'complete' } },
      },
      {
        id: 'pallet-complete',
        title: t('Pallet complete', 'Palette terminée', 'Palette fertig'),
        instruction: t('Watch the pallet finish processing.', 'Observez la fin du traitement de la palette.', 'Beobachten Sie das Ende der Palettenbearbeitung.'),
        expectedEvent: { type: WORKFLOW_PALLET_COMPLETE_EVENT },
      },
    ],
    successCriteria: [t('Every slot on the pallet was machined and returned.', 'Chaque alvéole de la palette a été usiné et rendu.', 'Jeder Slot der Palette wurde bearbeitet und zurückgelegt.')],
    instructorNotes: t('This is the reference machining cycle extracted from the simulator.', 'C’est le cycle d’usinage de référence extrait du simulateur.', 'Dies ist der aus dem Simulator extrahierte Referenz-Bearbeitungszyklus.'),
    explanation: t('A complete pallet cycle repeats pick, CNC load, machining, retrieve, and return for every slot.', 'Un cycle de palette complet répète prise, chargement CNC, usinage, extraction et retour pour chaque alvéole.', 'Ein kompletter Palettenzyklus wiederholt Greifen, CNC-Beladung, Bearbeitung, Entnahme und Rückgabe für jeden Slot.'),
  },
]

/** Lookup helper used by the runner and tests. */
export function getScenario(id: string): ScenarioDefinition {
  const scenario = SCENARIO_CATALOG.find((candidate) => candidate.id === id)
  if (!scenario) throw new Error(`Scenario '${id}' is not in the catalog.`)
  return scenario
}
