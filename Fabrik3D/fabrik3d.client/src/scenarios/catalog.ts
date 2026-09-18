/**
 * Built-in educational scenario catalog. The `pallet-processing` scenario
 * is the reference: it extracts the current machining cycle, so the
 * existing demonstration remains available.
 */

import type { LocalizedText, ScenarioActivity, ScenarioDefinition } from './types'
import { SCENARIO_SCHEMA_VERSION } from './types'
import { WORKFLOW_PALLET_COMPLETE_EVENT, WORKFLOW_PHASE_EVENT, WORKFLOW_RUN_STATE_EVENT } from './workflowEvents'

function t(en: string, fr: string, de: string): LocalizedText {
  return { en, fr, de }
}

function phaseActivity(id: string, title: LocalizedText, instruction: LocalizedText, phase: string): ScenarioActivity {
  return { id, title, instruction, expectedEvent: { type: WORKFLOW_PHASE_EVENT, match: { phase } } }
}

function industrialScenario(id: string, title: LocalizedText, level: 'intermediate' | 'advanced', event: string, faultInjections: import('../faults/types').FaultType[] = []): ScenarioDefinition {
  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION, id, title, level, prerequisites: [], faultInjections,
    learningObjectives: [t('Run the declared simulated cell cycle.', 'Exécuter le cycle simulé déclaré.', 'Den deklarierten Simulationszyklus ausführen.')],
    activities: [
      { id: 'prerequisites', title: t('Verify prerequisites', 'Vérifier les prérequis', 'Voraussetzungen prüfen'), instruction: t('Confirm that the virtual equipment is ready.', 'Confirmez que les équipements virtuels sont prêts.', 'Bestätigen Sie, dass die virtuelle Ausrüstung bereit ist.'), expectedEvent: { type: 'scenario.ready' } },
      { id: 'cycle', title, instruction: t('Run the simulated process.', 'Lancez le processus simulé.', 'Starten Sie den simulierten Prozess.'), expectedEvent: { type: event } },
      { id: 'recovery', title: t('Confirm outcome', 'Confirmer le résultat', 'Ergebnis bestätigen'), instruction: t('Confirm the simulated result and recovery when required.', 'Confirmez le résultat simulé et la récupération si nécessaire.', 'Bestätigen Sie das Simulationsergebnis und ggf. die Wiederherstellung.'), expectedEvent: { type: 'scenario.recovered' } },
    ],
    successCriteria: [t('The declared virtual cycle and recovery were completed.', 'Le cycle virtuel et sa récupération ont été terminés.', 'Der deklarierte virtuelle Zyklus und die Wiederherstellung wurden abgeschlossen.')],
    instructorNotes: t('All observed data is simulated training data.', 'Toutes les données observées sont des données de formation simulées.', 'Alle beobachteten Daten sind simulierte Trainingsdaten.'),
    explanation: t('This is a deterministic educational scenario, not an OEM program.', 'Ceci est un scénario pédagogique déterministe, pas un programme OEM.', 'Dies ist ein deterministisches Lernszenario, kein OEM-Programm.'),
  }
}

export const REFERENCE_SCENARIO_ID = 'pallet-processing'

export const SCENARIO_CATALOG: readonly ScenarioDefinition[] = [
  industrialScenario('sorting-normal-cycle', t('Vision sorting normal cycle', 'Cycle normal de tri vision', 'Normalzyklus Bildverarbeitung'), 'intermediate', 'sorting.complete'),
  industrialScenario('sorting-jam-recovery', t('Vision sorting jam recovery', 'Récupération bourrage de tri', 'Sortier-Stau Wiederherstellung'), 'advanced', 'sorting.recovered', ['conveyor-blockage']),
  industrialScenario('palletizing-normal-cycle', t('Palletizing normal cycle', 'Cycle normal de palettisation', 'Normalzyklus Palettierung'), 'intermediate', 'palletizing.complete'),
  industrialScenario('palletizing-vacuum-recovery', t('Palletizing vacuum recovery', 'Récupération perte de vide', 'Vakuumverlust Wiederherstellung'), 'advanced', 'palletizing.recovered', ['communication-loss']),
  industrialScenario('assembly-inspection-cycle', t('Assembly and inspection', 'Assemblage et contrôle', 'Montage und Prüfung'), 'intermediate', 'assembly.complete'),
  industrialScenario('safety-door-recovery', t('Safety door recovery', 'Récupération porte de sécurité', 'Sicherheitstür Wiederherstellung'), 'advanced', 'safety.restarted', ['collision-risk']),
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
