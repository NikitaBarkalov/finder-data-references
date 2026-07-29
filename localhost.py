import uvicorn
from dotenv import load_dotenv

if __name__ == "__main__":
    load_dotenv()

    print("Starting Finder of Citations Backend Server...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
