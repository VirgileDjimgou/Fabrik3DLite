export default {
  nav: {
    back: 'Zurueck', home: 'Home', new: 'Neu', edit: 'Bearbeiten',
    delete: 'Loeschen', job: 'Auftrag', messages: 'Meldungen',
    confirm: 'Bestaetigen', next: 'Weiter',
  },
  tiles: {
    start: 'Start', resume: 'Fortsetzen', pauseUnload: 'Abladen und Pause',
    currentJob: 'Aktueller Auftrag', jobList: 'Auftrag aus Liste',
    newJob: 'Neuer Auftrag', robotPositions: 'Roboterpositionen',
    extras: 'Extras', settings: 'Einstellungen',
  },
  status: {
    tempo: 'Tempo', progress: 'Fortschritt', slow: 'Langsam', fast: 'Schnell',
    details: 'Details', connected: 'Verbunden', reconnecting: 'Verbinde neu', disconnected: 'Getrennt',
    machineMode: 'Maschinenmodus', robotState: 'Roboter-Status',
    cncState: 'CNC-Status', currentPhase: 'Phase', currentPallet: 'Palette',
    currentSlot: 'Slot', machined: 'Bearbeitet', remaining: 'Verbleibend',
    total: 'Gesamt', idle: 'Leerlauf', running: 'Laeuft',
    paused: 'Pausiert', stopped: 'Gestoppt', completed: 'Abgeschlossen',
  },
  jobs: {
    title: 'Auftraege', name: 'Name', description: 'Beschreibung',
    status: 'Status', mode: 'Modus', created: 'Erstellt',
    progressPercent: 'Fortschritt', actions: 'Aktionen',
    create: 'Auftrag erstellen', deleteConfirm: 'Diesen Auftrag loeschen?',
    noJobs: 'Keine Auftraege gefunden.',
  },
  currentJob: {
    title: 'Aktueller Auftrag', noActiveJob: 'Kein aktiver Auftrag.',
    session: 'Sitzung', tasks: 'Aufgaben',
    machineState: 'Maschinenzustand', pause: 'Pause', stop: 'Stopp',
    noTasks: 'Keine Aufgaben.', part: 'Teiltyp', slot: 'Slot',
  },
  newJob: {
    title: 'Neuer Auftrag', namePlaceholder: 'Auftragsname',
    descriptionPlaceholder: 'Beschreibung (optional)',
    machineModeLabel: 'Maschinenmodus',
    submit: 'Erstellen', success: 'Auftrag erfolgreich erstellt.',
  },
  messages: { title: 'Meldungen', noMessages: 'Keine Meldungen.' },
  alarms: {
    title: 'Alarme', active: 'Aktiv', all: 'Alle',
    acknowledge: 'Quittieren', noAlarms: 'Keine Alarme.',
    severity: 'Schweregrad', source: 'Quelle', time: 'Zeit',
    acknowledged: 'Quittiert',
  },
  settings: {
    title: 'Einstellungen', language: 'Sprache',
    backendUrl: 'Backend-URL', connectionStatus: 'Verbindungsstatus',
  },
  robotPositions: {
    title: 'Roboterpositionen',
    placeholder: 'Roboterpositions-Steuerung wird in einem zukuenftigen Update verfuegbar sein.',
  },
}
