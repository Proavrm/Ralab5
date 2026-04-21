from app.repositories.security_repository import SecurityRepository

if __name__ == "__main__":
    repo = SecurityRepository()
    users = repo.list_all_users()
    for u in users:
        print(u["email"])
