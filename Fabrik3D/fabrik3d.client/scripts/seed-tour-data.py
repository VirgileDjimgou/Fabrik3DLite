"""Seed the tour demo database with clearly-labelled simulated alarms and operator messages.

The Fabrik3D API exposes read/acknowledge for alarms and read for messages, but no creation
endpoint. For the guided-tour video we pre-load a few explicitly simulated entries so the HMI
surfaces can be demonstrated. This script is idempotent: it replaces only the DEMO-* entries.
"""
from datetime import datetime, timezone
from pymongo import MongoClient

DB = "Fabrik3D_Tour"
ORG = "default"

now = datetime.now(timezone.utc).replace(tzinfo=None)

alarms = [
    {
        "OrganizationId": ORG,
        "Code": "DEMO-ALM-001",
        "Title": "Porte CNC ouverte pendant le cycle",
        "Message": "Le capteur de porte signale une ouverture non planifiée pendant l'usinage.",
        "Severity": "Warning",
        "Source": "cnc-1",
        "JobId": None,
        "SimulationSessionId": None,
        "CreatedAtUtc": now,
        "Acknowledged": False,
        "AcknowledgedAtUtc": None,
        "AcknowledgedBy": None,
        "LifecycleState": "Active",
        "FirstOccurredAtUtc": now,
        "LastOccurredAtUtc": now,
        "OccurrenceCount": 1,
        "Cause": "Simulation de formation : porte ouverte pendant le cycle d'usinage.",
        "Consequence": "Le cycle est interrompu ; aucune pièce n'est usinée dans cet état.",
        "OperatorGuidance": "Vérifier la zone, refermer la porte, puis acquitter l'alarme et relancer.",
        "AuditTrail": [],
    },
    {
        "OrganizationId": ORG,
        "Code": "DEMO-ALM-002",
        "Title": "Perte de vide préhenseur (simulée)",
        "Message": "Le niveau de vide du préhenseur est resté sous le seuil pédagogique.",
        "Severity": "Critical",
        "Source": "robot-1",
        "JobId": None,
        "SimulationSessionId": None,
        "CreatedAtUtc": now,
        "Acknowledged": False,
        "AcknowledgedAtUtc": None,
        "AcknowledgedBy": None,
        "LifecycleState": "Active",
        "FirstOccurredAtUtc": now,
        "LastOccurredAtUtc": now,
        "OccurrenceCount": 2,
        "Cause": "Panne simulée injectée depuis le laboratoire de pannes (overlay).",
        "Consequence": "Risque de perte de pièce : le workflow refuse les mouvements de transfert.",
        "OperatorGuidance": "Arrêter la mission, contrôler la pièce, effacer l'overlay puis réinitialiser.",
        "AuditTrail": [],
    },
    {
        "OrganizationId": ORG,
        "Code": "DEMO-ALM-003",
        "Title": "Dérive de vitesse convoyeur corrigée",
        "Message": "Écart de vitesse supérieur au seuil, revenu automatiquement dans la plage.",
        "Severity": "Info",
        "Source": "conveyor-1",
        "JobId": None,
        "SimulationSessionId": None,
        "CreatedAtUtc": now,
        "Acknowledged": True,
        "AcknowledgedAtUtc": now,
        "AcknowledgedBy": "demo-operateur",
        "LifecycleState": "Acknowledged",
        "FirstOccurredAtUtc": now,
        "LastOccurredAtUtc": now,
        "OccurrenceCount": 1,
        "Cause": "Fluctuation simulée du modèle convoyeur.",
        "Consequence": "Aucune : la régulation a corrigé l'écart.",
        "OperatorGuidance": "Aucune action requise ; conservé pour l'historique de formation.",
        "AuditTrail": [],
    },
]

messages = [
    {
        "OrganizationId": ORG,
        "Title": "Maintenance planifiée simulée",
        "Message": "Fenêtre de maintenance de démonstration prévue ce soir ; la cellule virtuelle sera réinitialisée.",
        "Type": "Info",
        "Source": "orchestrateur",
        "JobId": None,
        "SimulationSessionId": None,
        "CreatedAtUtc": now,
        "Read": False,
        "ReadAtUtc": None,
    },
    {
        "OrganizationId": ORG,
        "Title": "Consigne qualité",
        "Message": "Après chaque cycle CNC simulé, vérifier la pièce retournée dans le logement de palette.",
        "Type": "Instruction",
        "Source": "supervision",
        "JobId": None,
        "SimulationSessionId": None,
        "CreatedAtUtc": now,
        "Read": False,
        "ReadAtUtc": None,
    },
]

client = MongoClient("mongodb://localhost:27017")
db = client[DB]
db.alarms.delete_many({"Code": {"$regex": "^DEMO-ALM"}})
db.operatorMessages.delete_many({"Title": {"$in": [m["Title"] for m in messages]}})
db.alarms.insert_many(alarms)
db.operatorMessages.insert_many(messages)
print(f"seeded {len(alarms)} alarms and {len(messages)} messages into {DB}")
