from app import app
from school_app.services.keep_alive import run_keep_alive_cycle

print("Manually triggering Keep-Alive cycle...")
with app.app_context():
    run_keep_alive_cycle(app)
print("Keep-Alive cycle completed successfully.")
