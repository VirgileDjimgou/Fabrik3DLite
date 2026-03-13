export default {
  nav: {
    back: 'Retour', home: 'Accueil', new: 'Nouveau', edit: 'Modifier',
    delete: 'Supprimer', job: 'Travail', messages: 'Messages',
    confirm: 'Confirmer', next: 'Suivant',
  },
  tiles: {
    start: 'Demarrer', resume: 'Reprendre', pauseUnload: 'Pause / Decharger',
    currentJob: 'Travail actuel', jobList: 'Liste des travaux',
    newJob: 'Nouveau travail', robotPositions: 'Positions robot',
    extras: 'Extras', settings: 'Parametres',
  },
  status: {
    tempo: 'Tempo', progress: 'Progression', slow: 'Lent', fast: 'Rapide',
    details: 'Details', connected: 'Connecte', reconnecting: 'Reconnexion', disconnected: 'Deconnecte',
    machineMode: 'Mode machine', robotState: 'Etat robot',
    cncState: 'Etat CNC', currentPhase: 'Phase', currentPallet: 'Palette',
    currentSlot: 'Slot', machined: 'Usine', remaining: 'Restant',
    total: 'Total', idle: 'Inactif', running: 'En cours',
    paused: 'En pause', stopped: 'Arrete', completed: 'Termine',
  },
  jobs: {
    title: 'Travaux', name: 'Nom', description: 'Description',
    status: 'Statut', mode: 'Mode', created: 'Cree le',
    progressPercent: 'Progression', actions: 'Actions',
    create: 'Creer un travail', deleteConfirm: 'Supprimer ce travail ?',
    noJobs: 'Aucun travail trouve.',
  },
  currentJob: {
    title: 'Travail actuel', noActiveJob: 'Aucun travail actif.',
    session: 'Session', tasks: 'Taches',
    machineState: 'Etat machine', pause: 'Pause', stop: 'Arret',
    noTasks: 'Aucune tache.', part: 'Piece', slot: 'Slot',
  },
  newJob: {
    title: 'Nouveau travail', namePlaceholder: 'Nom du travail',
    descriptionPlaceholder: 'Description (optionnel)',
    machineModeLabel: 'Mode machine',
    submit: 'Creer', success: 'Travail cree avec succes.',
  },
  messages: { title: 'Messages', noMessages: 'Aucun message.' },
  alarms: {
    title: 'Alarmes', active: 'Actives', all: 'Toutes',
    acknowledge: 'Acquitter', noAlarms: 'Aucune alarme.',
    severity: 'Gravite', source: 'Source', time: 'Heure',
    acknowledged: 'Acquittee',
  },
  settings: {
    title: 'Parametres', language: 'Langue',
    backendUrl: 'URL du backend', connectionStatus: 'Etat de la connexion',
  },
  robotPositions: {
    title: 'Positions robot',
    placeholder: 'Les commandes de position robot seront disponibles dans une future mise a jour.',
  },
}
