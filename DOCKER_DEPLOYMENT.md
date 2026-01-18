# Docker Deployment Guide

## Prerequisites
- Docker installed and running
- Docker Compose (optional, for easier deployment)

## Quick Start with Docker Compose

1. **Update .env file** with your configuration:
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials and database URL
   ```

2. **Start the application with PostgreSQL**:
   ```bash
   docker-compose up -d
   ```

3. **Access the application**:
   - Application: http://localhost:5000
   - Database: localhost:5435

4. **View logs**:
   ```bash
   docker-compose logs -f app
   ```

5. **Stop the application**:
   ```bash
   docker-compose down
   ```

## Manual Docker Build and Run

### Build the Docker image:
```bash
docker build -t gemini-kg-extractor .
```

### Run with external PostgreSQL:
```bash
docker run -d \
  --name gemini-kg-app \
  -p 5000:5000 \
  -e DATABASE_URL="postgres://postgres:password@host.docker.internal:5435/gemini_scraper" \
  -e PORT=5000 \
  -e NODE_ENV=production \
  -e SESSION_SECRET="your-secret-key" \
  -e LOGIN_EMAIL="niveshak.connect@gmail.com" \
  -e LOGIN_PASSWORD="your-password" \
  gemini-kg-extractor
```

### Run with .env file:
```bash
docker run -d \
  --name gemini-kg-app \
  -p 5000:5000 \
  --env-file .env \
  gemini-kg-extractor
```

## Google Cloud Platform Deployment

### Using Google Cloud Run:

1. **Build and push to Google Container Registry**:
   ```bash
   # Set your project ID
   export PROJECT_ID=your-gcp-project-id
   
   # Build the image
   docker build -t gcr.io/$PROJECT_ID/gemini-kg-extractor .
   
   # Configure Docker for GCR
   gcloud auth configure-docker
   
   # Push the image
   docker push gcr.io/$PROJECT_ID/gemini-kg-extractor
   ```

2. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy gemini-kg-extractor \
     --image gcr.io/$PROJECT_ID/gemini-kg-extractor \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars "DATABASE_URL=postgres://user:pass@host:5432/db,SESSION_SECRET=your-secret,LOGIN_EMAIL=niveshak.connect@gmail.com,LOGIN_PASSWORD=your-password" \
     --memory 2Gi \
     --cpu 2 \
     --timeout 300
   ```

### Using Google Kubernetes Engine (GKE):

1. **Create a GKE cluster**:
   ```bash
   gcloud container clusters create gemini-kg-cluster \
     --num-nodes=1 \
     --machine-type=e2-medium \
     --region=us-central1
   ```

2. **Deploy the application**:
   ```bash
   # Create Kubernetes secret for environment variables
   kubectl create secret generic app-secrets \
     --from-literal=DATABASE_URL="your-db-url" \
     --from-literal=SESSION_SECRET="your-secret" \
     --from-literal=LOGIN_PASSWORD="your-password"
   
   # Deploy using kubectl
   kubectl apply -f k8s/deployment.yaml
   ```

## Environment Variables

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Application port (default: 5000)
- `NODE_ENV`: Environment (production/development)
- `SESSION_SECRET`: Secret key for session encryption
- `LOGIN_EMAIL`: Login email (hardcoded)
- `LOGIN_PASSWORD`: Login password

## Database Setup

The application expects a PostgreSQL database. Run migrations:

```bash
# Inside the container
docker exec -it gemini-kg-app npm run db:push
```

## Troubleshooting

### View application logs:
```bash
docker logs -f gemini-kg-app
```

### Access container shell:
```bash
docker exec -it gemini-kg-app sh
```

### Check Playwright installation:
```bash
docker exec -it gemini-kg-app npx playwright --version
```

### Restart the application:
```bash
docker restart gemini-kg-app
```

## Notes

- The Docker image includes Chromium browser for Playwright automation
- Default port is 5000 (configurable via PORT env variable)
- Application runs as non-root user (appuser) for security
- Multi-stage build optimizes image size
