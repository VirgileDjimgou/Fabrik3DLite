import type { OverlayFaultDefinition, OverlayFaultType } from './types'

const text = (en: string, fr: string, de: string) => ({ en, fr, de })

/**
 * Documentation catalog for the S38 overlay fault classes.
 *
 * Every entry states the layer it applies to, whether it is stochastic (and
 * therefore seeded), whether it only makes sense for numeric signals, and the
 * recovery guidance shown to the instructor. The catalog is data only: it never
 * executes code and never mutates a canonical signal definition.
 */
const definitions: Record<OverlayFaultType, OverlayFaultDefinition> = {
  'forced-true': {
    type: 'forced-true', layer: 'signal', severity: 'error', stochastic: false, numericOnly: false,
    title: text('Forced true', 'Forcé à vrai', 'Erzwungen wahr'),
    description: text('The signal is published as boolean true regardless of the runtime value.', 'Le signal est publié à vrai quelle que soit la valeur runtime.', 'Das Signal wird unabhängig vom Laufzeitwert als wahr veröffentlicht.'),
    recoveryInstructions: text('Remove the overlay to restore the runtime value.', 'Retirez la surcouche pour restaurer la valeur runtime.', 'Entfernen Sie das Overlay, um den Laufzeitwert wiederherzustellen.'),
  },
  'forced-false': {
    type: 'forced-false', layer: 'signal', severity: 'error', stochastic: false, numericOnly: false,
    title: text('Forced false', 'Forcé à faux', 'Erzwungen falsch'),
    description: text('The signal is published as boolean false regardless of the runtime value.', 'Le signal est publié à faux quelle que soit la valeur runtime.', 'Das Signal wird unabhängig vom Laufzeitwert als falsch veröffentlicht.'),
    recoveryInstructions: text('Remove the overlay to restore the runtime value.', 'Retirez la surcouche pour restaurer la valeur runtime.', 'Entfernen Sie das Overlay, um den Laufzeitwert wiederherzustellen.'),
  },
  'frozen-value': {
    type: 'frozen-value', layer: 'signal', severity: 'warning', stochastic: false, numericOnly: false,
    title: text('Frozen value', 'Valeur figée', 'Eingefrorener Wert'),
    description: text('The first observed value is latched and republished; later runtime changes are ignored.', 'La première valeur observée est figée et republiée ; les changements ultérieurs sont ignorés.', 'Der erste beobachtete Wert wird eingefroren und erneut veröffentlicht; spätere Änderungen werden ignoriert.'),
    recoveryInstructions: text('Remove the overlay to resume live values.', 'Retirez la surcouche pour reprendre les valeurs en direct.', 'Entfernen Sie das Overlay, um Live-Werte fortzusetzen.'),
  },
  disconnected: {
    type: 'disconnected', layer: 'signal', severity: 'error', stochastic: false, numericOnly: false,
    title: text('Disconnected', 'Déconnecté', 'Getrennt'),
    description: text('The signal is reported with bad quality and its safe value; the link is treated as lost.', 'Le signal est signalé en mauvaise qualité avec sa valeur sûre ; le lien est considéré perdu.', 'Das Signal wird mit schlechter Qualität und sicherem Wert gemeldet; die Verbindung gilt als verloren.'),
    recoveryInstructions: text('Remove the overlay to restore the link.', 'Retirez la surcouche pour rétablir le lien.', 'Entfernen Sie das Overlay, um die Verbindung wiederherzustellen.'),
  },
  'degraded-quality': {
    type: 'degraded-quality', layer: 'signal', severity: 'warning', stochastic: false, numericOnly: false,
    title: text('Degraded quality', 'Qualité dégradée', 'Beeinträchtigte Qualität'),
    description: text('The value is preserved but its quality is downgraded to uncertain.', 'La valeur est conservée mais sa qualité est dégradée en incertaine.', 'Der Wert bleibt erhalten, die Qualität wird jedoch auf unsicher herabgestuft.'),
    recoveryInstructions: text('Remove the overlay to restore good quality.', 'Retirez la surcouche pour restaurer une bonne qualité.', 'Entfernen Sie das Overlay, um gute Qualität wiederherzustellen.'),
  },
  intermittent: {
    type: 'intermittent', layer: 'signal', severity: 'warning', stochastic: true, numericOnly: false,
    title: text('Intermittent', 'Intermittent', 'Unterbrochen'),
    description: text('A seeded pattern drops the signal to its safe value for part of each period.', 'Un motif ensemencé fait chuter le signal vers sa valeur sûre pendant une partie de chaque période.', 'Ein gesetztes Muster setzt das Signal für einen Teil jeder Periode auf den sicheren Wert.'),
    recoveryInstructions: text('Remove the overlay to restore a continuous signal.', 'Retirez la surcouche pour restaurer un signal continu.', 'Entfernen Sie das Overlay, um ein kontinuierliches Signal wiederherzustellen.'),
  },
  delayed: {
    type: 'delayed', layer: 'signal', severity: 'warning', stochastic: false, numericOnly: false,
    title: text('Delayed', 'Retardé', 'Verzögert'),
    description: text('The published value lags the runtime by a fixed delay, shifting downstream cycle timing.', 'La valeur publiée retarde d’un délai fixe, décalant la cadence en aval.', 'Der veröffentlichte Wert verzögert sich um eine feste Zeit und verschiebt den nachgelagerten Zyklus.'),
    recoveryInstructions: text('Remove the overlay to restore immediate publication.', 'Retirez la surcouche pour restaurer une publication immédiate.', 'Entfernen Sie das Overlay, um die sofortige Veröffentlichung wiederherzustellen.'),
  },
  'noisy-analog': {
    type: 'noisy-analog', layer: 'signal', severity: 'warning', stochastic: true, numericOnly: true,
    title: text('Noisy analog', 'Analogique bruité', 'Verrauschtes Analogsignal'),
    description: text('A seeded bounded noise is added to a numeric value; the sequence is reproducible.', 'Un bruit borné ensemencé est ajouté à une valeur numérique ; la séquence est reproductible.', 'Ein gesetztes begrenztes Rauschen wird zu einem numerischen Wert addiert; die Sequenz ist reproduzierbar.'),
    recoveryInstructions: text('Remove the overlay to restore the clean value.', 'Retirez la surcouche pour restaurer la valeur propre.', 'Entfernen Sie das Overlay, um den sauberen Wert wiederherzustellen.'),
  },
  drift: {
    type: 'drift', layer: 'signal', severity: 'warning', stochastic: true, numericOnly: true,
    title: text('Drift', 'Dérive', 'Drift'),
    description: text('A seeded monotonic offset grows over time, simulating sensor drift.', 'Un décalage monotone ensemencé croît avec le temps, simulant une dérive de capteur.', 'Ein gesetztes monoton wachsendes Offset simuliert Sensordrift.'),
    recoveryInstructions: text('Remove the overlay to restore the calibrated value.', 'Retirez la surcouche pour restaurer la valeur calibrée.', 'Entfernen Sie das Overlay, um den kalibrierten Wert wiederherzustellen.'),
  },
  inverted: {
    type: 'inverted', layer: 'signal', severity: 'error', stochastic: false, numericOnly: false,
    title: text('Inverted', 'Inversé', 'Invertiert'),
    description: text('A boolean signal is inverted, changing downstream state.', 'Un signal booléen est inversé, modifiant l’état en aval.', 'Ein boolesches Signal wird invertiert und ändert den nachgelagerten Zustand.'),
    recoveryInstructions: text('Remove the overlay to restore the true polarity.', 'Retirez la surcouche pour restaurer la polarité réelle.', 'Entfernen Sie das Overlay, um die echte Polarität wiederherzustellen.'),
  },
  'actuator-jam': {
    type: 'actuator-jam', layer: 'equipment', severity: 'critical', stochastic: false, numericOnly: false,
    title: text('Actuator jam', 'Blocage d’actionneur', 'Aktorblockade'),
    description: text('The actuator stops moving; motion commands are refused while the overlay is active.', 'L’actionneur cesse de bouger ; les commandes de mouvement sont refusées tant que la surcouche est active.', 'Der Aktor bewegt sich nicht mehr; Bewegungsbefehle werden abgelehnt, solange das Overlay aktiv ist.'),
    recoveryInstructions: text('Clear the simulated jam, then remove the overlay.', 'Supprimez le blocage simulé, puis retirez la surcouche.', 'Beseitigen Sie die simulierte Blockade und entfernen Sie dann das Overlay.'),
  },
  'actuator-slow-response': {
    type: 'actuator-slow-response', layer: 'equipment', severity: 'warning', stochastic: false, numericOnly: false,
    title: text('Actuator slow response', 'Réponse lente d’actionneur', 'Langsame Aktorreaktion'),
    description: text('Motion durations are stretched by a documented factor, visibly lagging the nominal cycle.', 'Les durées de mouvement sont allongées d’un facteur documenté, en retard visible sur le cycle nominal.', 'Bewegungsdauern werden um einen dokumentierten Faktor gestreckt und sichtbar verzögert.'),
    recoveryInstructions: text('Remove the overlay to restore nominal timing.', 'Retirez la surcouche pour restaurer la cadence nominale.', 'Entfernen Sie das Overlay, um das nominale Timing wiederherzustellen.'),
  },
  'motor-overload': {
    type: 'motor-overload', layer: 'equipment', severity: 'error', stochastic: false, numericOnly: false,
    title: text('Motor overload', 'Surcharge moteur', 'Motorüberlast'),
    description: text('The drive reports a fault and refuses new run commands until cleared.', 'Le variateur signale un défaut et refuse les nouvelles commandes jusqu’à acquittement.', 'Der Antrieb meldet einen Fehler und lehnt neue Befehle bis zur Quittierung ab.'),
    recoveryInstructions: text('Acknowledge the overload, then remove the overlay.', 'Acquittez la surcharge, puis retirez la surcouche.', 'Quittieren Sie die Überlast und entfernen Sie dann das Overlay.'),
  },
  'vacuum-loss': {
    type: 'vacuum-loss', layer: 'equipment', severity: 'error', stochastic: false, numericOnly: false,
    title: text('Vacuum loss', 'Perte de vide', 'Vakuumverlust'),
    description: text('The gripper loses vacuum; payload detection reports no part while the overlay is active.', 'Le préhenseur perd le vide ; la détection de pièce ne signale aucune pièce tant que la surcouche est active.', 'Der Greifer verliert das Vakuum; die Teileerkennung meldet kein Teil, solange das Overlay aktiv ist.'),
    recoveryInstructions: text('Restore the simulated vacuum, then remove the overlay.', 'Rétablissez le vide simulé, puis retirez la surcouche.', 'Stellen Sie das simulierte Vakuum wieder her und entfernen Sie dann das Overlay.'),
  },
  'sensor-contamination': {
    type: 'sensor-contamination', layer: 'equipment', severity: 'warning', stochastic: false, numericOnly: false,
    title: text('Sensor contamination', 'Contamination de capteur', 'Sensorverschmutzung'),
    description: text('A photoeye is treated as blocked, so the conveyor logic misbehaves.', 'Une cellule photoélectrique est considérée obstruée, perturbant la logique du convoyeur.', 'Eine Lichtschranke gilt als blockiert, wodurch die Fördererlogik fehlschlägt.'),
    recoveryInstructions: text('Clean the simulated sensor, then remove the overlay.', 'Nettoyez le capteur simulé, puis retirez la surcouche.', 'Reinigen Sie den simulierten Sensor und entfernen Sie dann das Overlay.'),
  },
  'communications-loss': {
    type: 'communications-loss', layer: 'equipment', severity: 'critical', stochastic: false, numericOnly: false,
    title: text('Communications loss', 'Perte de communication', 'Kommunikationsverlust'),
    description: text('The equipment link is treated as lost; its signals report bad quality and safe values.', 'Le lien équipement est considéré perdu ; ses signaux signalent une mauvaise qualité et des valeurs sûres.', 'Die Anlagenverbindung gilt als verloren; ihre Signale melden schlechte Qualität und sichere Werte.'),
    recoveryInstructions: text('Reconnect the simulated link, then remove the overlay.', 'Reconnectez le lien simulé, puis retirez la surcouche.', 'Verbinden Sie die simulierte Verbindung erneut und entfernen Sie dann das Overlay.'),
  },
}

export function getOverlayFaultDefinition(type: OverlayFaultType): OverlayFaultDefinition {
  return definitions[type]
}

export const OVERLAY_FAULT_CATALOG: readonly OverlayFaultDefinition[] = Object.values(definitions)

export function isOverlayFaultType(value: unknown): value is OverlayFaultType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(definitions, value)
}
