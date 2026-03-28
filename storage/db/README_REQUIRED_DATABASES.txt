# File: storage/db/README_REQUIRED_DATABASES.txt
# Description: Databases required by the current live FastAPI baseline.

The copied backend logic expects the existing databases from the current RaLab3 project.

Required current files:
- data/ralab3.db
- data/dst.db
- data/security.db

Legacy / secondary files still present in RaLab3:
- data/affaires.db
- data/demandes.db
- data/etudes.db

For the transition phase, keep using the current databases.
Do not rename the live database before the repositories and routes are migrated safely.
