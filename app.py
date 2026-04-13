import os
from dotenv import load_dotenv

# Load environment variables before any other imports that might need them
load_dotenv()

from school_app import create_app

app = create_app()

if __name__ == "__main__":
    # Standard Flask runner for local development
    # Railway will use Gunicorn from the Procfile/nixpacks.toml
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
