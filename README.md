Prompt Used:

```markdown
# PROJECT: Gemini Knowledge Graph Extractor with Queue & Multi-Account Rotation

Build a production-ready FastAPI application with the following specifications:

## AUTHENTICATION REQUIREMENT
- Implement login page with hardcoded credentials (NO signup, NO password reset)
- Email: niveshak.connect@gmail.com, Paswword - [NOT DISCLOSED, same as tweeter service]
- Use session-based authentication with secure cookies
- Redirect all routes to /login if not authenticated
- Session expires after 24 hours

## TECH STACK
- Backend: FastAPI (Python 3.11+)
- Database: PostgreSQL with SQLAlchemy async ORM
- Web Automation: Playwright with playwright-stealth
- Frontend: HTML/Tailwind CSS/Alpine.js
- Task Queue: Background processing with asyncio
- Encryption: cryptography (Fernet) for password storage

## DATABASE SCHEMA

Create these tables in PostgreSQL:

```sql
-- Stocks table
CREATE TABLE stocks (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) UNIQUE NOT NULL,
    company_name VARCHAR(255),
    industry VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Industries table
CREATE TABLE industries (
    id SERIAL PRIMARY KEY,
    industry_name VARCHAR(255) UNIQUE NOT NULL,
    sector VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Extraction queue
CREATE TABLE extraction_queue (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL,
    entity_id INT NOT NULL,
    entity_name VARCHAR(255) NOT NULL,
    prompt_text TEXT NOT NULL,
    gemini_model VARCHAR(50) DEFAULT 'gemini-3-pro',
    status VARCHAR(20) DEFAULT 'queued',
    assigned_account_id INT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    priority INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_queue_status ON extraction_queue(status, priority DESC, created_at);

-- Knowledge graphs storage
CREATE TABLE knowledge_graphs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(20) NOT NULL,
    entity_id INT NOT NULL,
    entity_name VARCHAR(255) NOT NULL,
    queue_task_id INT,
    kg_json JSONB NOT NULL,
    extraction_confidence FLOAT,
    gemini_model_used VARCHAR(50),
    gemini_account_used INT,
    extracted_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_kg_entity ON knowledge_graphs(entity_type, entity_id);

-- Gemini accounts for rotation
CREATE TABLE gemini_accounts (
    id SERIAL PRIMARY KEY,
    account_name VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_currently_in_use BOOLEAN DEFAULT false,
    last_used_at TIMESTAMP,
    total_extractions_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    failure_count INT DEFAULT 0,
    last_error TEXT,
    rate_limited_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- System configuration
CREATE TABLE system_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT,
    config_type VARCHAR(20) DEFAULT 'string',
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO system_config (config_key, config_value, config_type, description) VALUES
('total_stocks_target', '0', 'integer', 'Total stocks target'),
('total_industries_target', '0', 'integer', 'Total industries target'),
('queue_processing_enabled', 'true', 'boolean', 'Enable queue processing'),
('account_rotation_strategy', 'random', 'string', 'Account rotation strategy');

-- Browser configuration
CREATE TABLE browser_configs (
    id SERIAL PRIMARY KEY,
    config_name VARCHAR(100) UNIQUE NOT NULL DEFAULT 'default',
    viewport_width INT DEFAULT 1920,
    viewport_height INT DEFAULT 1080,
    user_agent TEXT,
    timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
    locale VARCHAR(10) DEFAULT 'en-IN',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO browser_configs (config_name) VALUES ('default');

-- Stealth configuration
CREATE TABLE stealth_configs (
    id SERIAL PRIMARY KEY,
    config_name VARCHAR(100) UNIQUE NOT NULL DEFAULT 'default',
    typing_speed_min INT DEFAULT 50,
    typing_speed_max INT DEFAULT 150,
    request_delay_min INT DEFAULT 30,
    request_delay_max INT DEFAULT 90,
    enable_random_pauses BOOLEAN DEFAULT true,
    random_pause_probability FLOAT DEFAULT 0.3,
    random_pause_duration_min INT DEFAULT 5000,
    random_pause_duration_max INT DEFAULT 15000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO stealth_configs (config_name) VALUES ('default');

-- Activity logs
CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    log_level VARCHAR(20),
    log_message TEXT,
    entity_type VARCHAR(20),
    entity_id INT,
    queue_task_id INT,
    account_id INT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_logs_created_at ON activity_logs(created_at DESC);
```

## FILE STRUCTURE

Create the following file structure:

```
/
├── main.py                 # FastAPI app with authentication
├── models.py              # SQLAlchemy models
├── queue_processor.py     # Queue processing logic
├── gemini_scraper.py      # Playwright automation
├── auth.py                # Authentication middleware
├── requirements.txt       # Dependencies
├── templates/
│   ├── login.html        # Login page
│   └── dashboard.html    # Main dashboard
└── static/
    └── styles.css        # Custom styles (if needed)
```

## CORE REQUIREMENTS

### 1. AUTHENTICATION (auth.py)
```python
from fastapi import Request, HTTPException, status
from fastapi.responses import RedirectResponse
from starlette.middleware.base import BaseHTTPMiddleware
import hashlib
import secrets

# Hardcoded credentials
ADMIN_EMAIL = "niveshak.connect@gmail.com"
ADMIN_PASSWORD_HASH = hashlib.sha256("v7F50PJa8NbBin".encode()).hexdigest()

# Session storage (in-memory, or use Redis for production)
active_sessions = {}

def verify_credentials(email: str, password: str) -> bool:
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    return email == ADMIN_EMAIL and password_hash == ADMIN_PASSWORD_HASH

def create_session(email: str) -> str:
    session_token = secrets.token_urlsafe(32)
    active_sessions[session_token] = {
        "email": email,
        "created_at": datetime.utcnow()
    }
    return session_token

def verify_session(session_token: str) -> bool:
    if session_token not in active_sessions:
        return False
    
    # Check if session expired (24 hours)
    session_data = active_sessions[session_token]
    if datetime.utcnow() - session_data["created_at"] > timedelta(hours=24):
        del active_sessions[session_token]
        return False
    
    return True

class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip auth for login page and static files
        if request.url.path in ["/login", "/api/login"] or request.url.path.startswith("/static"):
            return await call_next(request)
        
        # Check session cookie
        session_token = request.cookies.get("session_token")
        
        if not session_token or not verify_session(session_token):
            if request.url.path.startswith("/api/"):
                raise HTTPException(status_code=401, detail="Unauthorized")
            return RedirectResponse(url="/login", status_code=302)
        
        return await call_next(request)
```

### 2. MAIN APPLICATION (main.py)

Implement FastAPI with:
- Login route (GET /login, POST /api/login)
- Logout route (POST /api/logout)
- Dashboard route (GET /)
- All API endpoints as specified in previous response
- Authentication middleware on all routes except login
- Session management with secure cookies
- WebSocket for live logs
- Background task for queue processing

### 3. QUEUE PROCESSOR (queue_processor.py)

Implement:
- Sequential processing (one task at a time)
- Random account selection from available accounts
- Account locking during use
- Rate limit detection and account rotation
- Retry logic with max 3 attempts
- Status updates to database
- Real-time log broadcasting via WebSocket

### 4. GEMINI SCRAPER (gemini_scraper.py)

Implement with playwright-stealth:
- Browser initialization with anti-detection
- Human-like typing with random delays
- Random mouse movements and scrolling
- Gemini login automation
- Model selection (ensure Gemini 3 Pro)
- Prompt submission
- Response extraction
- Store raw Gemini response as-is in kg_json column
- Random delays between requests (configurable)

### 5. DASHBOARD UI (templates/dashboard.html)

Create a single-page dashboard with tabs:

**Tab 1: Overview**
- Display statistics cards:
  - Total Stocks (with target and progress bar)
  - Total Industries (with target and progress bar)
  - Extracted KGs count
  - Queue status (pending, processing)
- Target input fields (editable, save button updates system_config table)

**Tab 2: Add Task**
- Dropdown: Select entity type (Stock/Industry) - default: Stock
- If Stock selected: Show stock symbol input and company name
- If Industry selected: Show industry name input and sector
- Large textarea for prompt (with placeholder showing it should contain sources)
- Priority slider (0-10)
- "Add to Queue" button
- Current queue display (table with: Entity Type, Name, Status, Priority, Created At)

**Tab 3: Stocks**
- Table showing all stocks with columns: Symbol, Company, Industry, Status, Actions
- "Add Stock" button (modal to add symbol, company name, industry)
- Bulk import option (paste CSV: symbol,company_name,industry)
- Status badges with colors (pending: gray, processing: yellow, completed: green, failed: red)
- Click on row to view extracted KG

**Tab 4: Industries**
- Table showing all industries with columns: Industry Name, Sector, Status, Actions
- "Add Industry" button
- Status badges

**Tab 5: Gemini Accounts**
- Table showing accounts: Name, Email, Status, Success Rate, Total Extractions, Last Used, Actions
- "Add Account" button (modal with: account_name, email, password)
- Delete button per account
- Visual indicator if account is currently in use or rate limited

**Tab 6: Configuration**
- Section: Stealth Behavior
  - Typing Speed Min/Max (ms per character)
  - Request Delay Min/Max (seconds)
  - Enable Random Pauses (checkbox)
  - Random Pause Probability (0-1 slider)
  - Save button (POST /api/config/stealth)

- Section: Browser Settings
  - Viewport Width/Height
  - User Agent (optional, auto-generated if empty)
  - Timezone
  - Locale
  - Save button (POST /api/config/browser)

**Tab 7: Extracted KGs**
- Cards for each extracted KG
- Show: Entity Type badge, Entity Name, Model Used, Extracted At
- Collapsible JSON viewer with syntax highlighting
- "Copy JSON" button (copies to clipboard)
- Filter by entity type (Stock/Industry)
- Search by entity name

**Tab 8: Live Logs**
- Terminal-style log display (black background, colored text by log level)
- Auto-scroll to latest
- Log levels with emoji: info (ℹ️), success (✅), warning (⚠️), error (❌), debug (🔍)
- Shows: timestamp, log level, message, entity name
- Clear logs button

**Global Elements:**
- Top navigation bar with app title and logout button
- Queue control buttons (Start/Stop Processing)
- Live status indicator (Processing/Idle)

### 6. LOGIN PAGE (templates/login.html)

Create clean login page:
- Center-aligned login form
- Email input (type="email")
- Password input (type="password")
- Login button
- Error message display for invalid credentials
- No signup link, no password reset
- On successful login, redirect to dashboard

### 7. MODELS (models.py)

Define SQLAlchemy models matching the database schema with:
- Proper relationships
- Indexes for performance
- JSON fields for metadata
- Timestamp fields with auto-update

### 8. REQUIREMENTS (requirements.txt)

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
asyncpg==0.29.0
playwright==1.41.0
playwright-stealth==1.0.6
pydantic==2.5.3
python-multipart==0.0.6
cryptography==42.0.0
python-dotenv==1.0.0
websockets==12.0
jinja2==3.1.3
itsdangerous==2.1.2
```

## ENVIRONMENT VARIABLES

Create .env file with:
```
DATABASE_URL=postgresql+asyncpg://user:password@localhost:5432/kgdb
ENCRYPTION_KEY=<generate using Fernet.generate_key()>
SECRET_KEY=<random secret for sessions>
```

## DEPLOYMENT STEPS

1. Install dependencies: `pip install -r requirements.txt`
2. Install Playwright: `playwright install chromium`
3. Initialize database with schema
4. Generate encryption key and add to .env
5. Run: `uvicorn main:app --host 0.0.0.0 --port 8000`

## CRITICAL FEATURES TO IMPLEMENT

✅ **Sequential Queue Processing**: Only one extraction at a time
✅ **Multi-Account Rotation**: Random selection from available accounts
✅ **Rate Limit Protection**: Auto-detect and skip rate-limited accounts
✅ **Human-like Automation**: Random delays, typing speed, mouse movements
✅ **Always Gemini 3 Pro**: Hardcoded model selection
✅ **Raw Response Storage**: Save complete Gemini output as-is in kg_json
✅ **Stock/Industry Separation**: Dropdown to distinguish entity types
✅ **Target Tracking**: Display progress toward extraction goals
✅ **Real-time Monitoring**: WebSocket-based live logs
✅ **Full UI Configuration**: All settings editable without code changes
✅ **Secure Authentication**: Session-based with hardcoded credentials
✅ **Copy to Clipboard**: Easy JSON extraction from UI
✅ SHOW NON REMOVABLE HEADER BANNER ON DASHBOARD HOMEPAGE IF 3 consecutive extraction jobs fails.

## UI/UX REQUIREMENTS

- Use Tailwind CSS for styling
- Responsive design (mobile-friendly)
- Loading spinners for async operations
- Success/error toast notifications
- Confirmation dialogs for destructive actions
- Form validation on client and server side
- Disable buttons during processing
- Visual feedback for all user actions

## ERROR HANDLING

- Try-catch all async operations
- Display user-friendly error messages
- Log detailed errors to activity_logs table
- Retry failed tasks with exponential backoff
- Graceful browser cleanup on errors

## SECURITY

- Hash and verify login credentials
- Encrypt Gemini account passwords with Fernet
- Use secure session cookies (httponly, secure flags)
- Validate all user inputs
- Prevent SQL injection with parameterized queries
- Rate limit API endpoints

## PERFORMANCE

- Use connection pooling for database
- Async/await for all I/O operations
- Index database tables properly
- Lazy load large JSON responses
- WebSocket for real-time updates (not polling)

## TESTING

Before deployment, test:
1. Login with correct/incorrect credentials
2. Add stocks and industries
3. Add multiple Gemini accounts
4. Create extraction tasks
5. Start queue processing
6. Monitor live logs
7. View extracted KGs
8. Copy JSON to clipboard
9. Update configuration and verify persistence
10. Account rotation during extraction
11. Rate limit handling
12. Session expiration after 24 hours

Now generate the complete working application with all files.
```

***
