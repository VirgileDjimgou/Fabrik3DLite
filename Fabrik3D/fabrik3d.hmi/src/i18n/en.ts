export default {
  nav: {
    back: 'Back', home: 'Home', new: 'New', edit: 'Edit',
    delete: 'Delete', job: 'Job', messages: 'Messages',
    confirm: 'Confirm', next: 'Next',
  },
  tiles: {
    start: 'Start', resume: 'Resume', pauseUnload: 'Pause / Unload',
    currentJob: 'Current Job', jobList: 'Job List', newJob: 'New Job',
    robotPositions: 'Robot Positions', extras: 'Extras', settings: 'Settings',
  },
  status: {
    tempo: 'Tempo', progress: 'Progress', slow: 'Slow', fast: 'Fast',
    details: 'Details', connected: 'Connected', reconnecting: 'Reconnecting', disconnected: 'Disconnected',
    machineMode: 'Machine Mode', robotState: 'Robot State', cncState: 'CNC State',
    currentPhase: 'Phase', currentPallet: 'Pallet', currentSlot: 'Slot',
    machined: 'Machined', remaining: 'Remaining', total: 'Total',
    idle: 'Idle', running: 'Running', paused: 'Paused',
    stopped: 'Stopped', completed: 'Completed',
  },
  jobs: {
    title: 'Jobs', name: 'Name', description: 'Description',
    status: 'Status', mode: 'Mode', created: 'Created',
    progressPercent: 'Progress', actions: 'Actions',
    create: 'Create Job', deleteConfirm: 'Delete this job?',
    noJobs: 'No jobs found.',
  },
  currentJob: {
    title: 'Current Job', noActiveJob: 'No active job.',
    session: 'Session', tasks: 'Tasks',
    machineState: 'Machine State', pause: 'Pause', stop: 'Stop',
    noTasks: 'No tasks.', part: 'Part', slot: 'Slot',
  },
  newJob: {
    title: 'New Job', namePlaceholder: 'Job name',
    descriptionPlaceholder: 'Description (optional)',
    machineModeLabel: 'Machine Mode',
    submit: 'Create', success: 'Job created successfully.',
  },
  messages: { title: 'Messages', noMessages: 'No messages.' },
  alarms: {
    title: 'Alarms', active: 'Active', all: 'All',
    acknowledge: 'Acknowledge', noAlarms: 'No alarms.',
    severity: 'Severity', source: 'Source', time: 'Time',
    acknowledged: 'Acknowledged',
  },
  settings: {
    title: 'Settings', language: 'Language',
    backendUrl: 'Backend URL', connectionStatus: 'Connection Status',
  },
  robotPositions: {
    title: 'Robot Positions',
    placeholder: 'Robot position controls will be available in a future update.',
  },
}
