# AttendTrack Backend (FastAPI + PostgreSQL)

This is the backend API application for AttendTrack. It is built using **FastAPI**, **SQLAlchemy** (using a repository layout), **Alembic** (for database migrations), and **PostgreSQL** as the database storage.

## Folder Structure

The application code is fully structured under the `app/` folder:
- **`app/core/`**: Config settings loader matching values in `.env` using Pydantic Settings.
- **`app/db/`**: Connection engine initialization and session makers.
- **`app/model/`**: Declarative models defining columns for Employee, Department, DailyAttendance, and LeaveRecord.
- **`app/schema/`**: Schemas defining type interfaces for request validation and serialization.
- **`app/api/`**: Module dependencies and routers grouped by entity.
- **`run.py`**: Uvicorn server startup script.

---

## Getting Started

### 1. Setup Virtual Environment (`.venv`)
Initialize and activate a virtual environment in the `Backend` directory:

#### Windows (PowerShell)
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

#### macOS / Linux
```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

### 2. Install Dependencies
Install the required packages in the active virtual environment:
```bash
pip install -r requirements.txt
```

---

### 3. Setup Configuration (`.env`)
Create a `.env` file in the root of the `Backend/` folder. It will contain:
```ini
PROJECT_NAME="AttendTrack API"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/attendtrack"
ENV="development"
```
Ensure you update the database link to match your PostgreSQL server configuration.

---

### 4. Database Migrations (Alembic)
Alembic manages table creation and schema changes over time.

#### Initialize database tables (First time)
Generate the initial database migration file:
```bash
alembic revision --autogenerate -m "Initial schema"
```

#### Apply Migrations
Run migrations to create the database schemas and tables in PostgreSQL:
```bash
alembic upgrade head
```

---

### 5. Running the Application
Launch the development API backend server:
```bash
python run.py
```
The server will start on: **`http://localhost:8000`**

- **Interactive API Documentation (Swagger UI)**: **`http://localhost:8000/docs`**
- **Alternative Redoc Documentation**: **`http://localhost:8000/redoc`**
