"""Seed demo data for HODIX. Idempotent — runs only if super admin doesn't exist."""
import asyncio
import random
from datetime import datetime, timezone, timedelta

from db import get_db, ensure_indexes
from models import Role, gen_id
from security import hash_password


async def seed():
    db = get_db()
    await ensure_indexes()

    # Idempotency check
    admin = await db.users.find_one({"email": "admin@hodix.app"})
    if admin:
        # Ensure raisanguemo account exists even if seed ran before
        existing = await db.users.find_one({"email": "raisanguemo@gmail.com"})
        if not existing:
            await db.users.insert_one({
                "id": gen_id(), "email": "raisanguemo@gmail.com",
                "full_name": "Raïsa Nguemo",
                "hashed_password": hash_password("Hodix2025!"),
                "role": Role.SUPER_ADMIN.value,
                "is_active": True, "is_email_verified": True,
                "phone": None, "gender": None, "country": "Cameroun",
                "city": None, "occupation": "Super Admin",
                "photo_base64": None, "profile_complete": False,
                "created_at": now, "updated_at": now,
            })
            print("[seed] Created raisanguemo@gmail.com super admin")
        print("[seed] Already seeded — skipping.")
        return

    now = datetime.now(timezone.utc)

    # ---------------- USERS ----------------
    users = []
    raisa_admin = {
        "id": gen_id(),
        "email": "raisanguemo@gmail.com",
        "full_name": "Raïsa Nguemo",
        "hashed_password": hash_password("Hodix2025!"),
        "role": Role.SUPER_ADMIN.value,
        "is_active": True, "is_email_verified": True,
        "phone": None, "gender": None, "country": "Cameroun",
        "city": None, "occupation": "Super Admin",
        "photo_base64": None, "profile_complete": False,
        "created_at": now - timedelta(days=200),
        "updated_at": now,
    }
    users.append(raisa_admin)
    superadmin = {
        "id": gen_id(),
        "email": "admin@hodix.app",
        "full_name": "Admin Hodix",
        "hashed_password": hash_password("Admin123!"),
        "role": Role.SUPER_ADMIN.value,
        "is_active": True, "is_email_verified": True,
        "phone": "+237 690 00 00 00", "gender": "Autre",
        "country": "Cameroun", "city": "Yaoundé", "occupation": "Administrateur",
        "photo_base64": None,
        "created_at": now - timedelta(days=180),
        "updated_at": now,
    }
    users.append(superadmin)

    demo_user = {
        "id": gen_id(),
        "email": "demo@hodix.app",
        "full_name": "Aïssatou Demo",
        "hashed_password": hash_password("Demo123!"),
        "role": Role.MEMBER.value,
        "is_active": True, "is_email_verified": True,
        "phone": "+237 690 12 34 56", "gender": "Femme",
        "country": "Cameroun", "city": "Douala", "occupation": "Commerçante",
        "photo_base64": None,
        "created_at": now - timedelta(days=120),
        "updated_at": now,
    }
    users.append(demo_user)

    manager_user = {
        "id": gen_id(),
        "email": "manager@hodix.app",
        "full_name": "Mariam Manager",
        "hashed_password": hash_password("Manager123!"),
        "role": Role.TONTINE_MANAGER.value,
        "is_active": True, "is_email_verified": True,
        "phone": "+237 690 22 33 44", "gender": "Femme",
        "country": "Cameroun", "city": "Yaoundé", "occupation": "Gestionnaire communautaire",
        "photo_base64": None,
        "created_at": now - timedelta(days=150),
        "updated_at": now,
    }
    users.append(manager_user)

    other_names = [
        ("Awa Diallo", "awa@hodix.app", "Femme", "Sénégal", "Dakar", "Couturière"),
        ("Kofi Mensah", "kofi@hodix.app", "Homme", "Ghana", "Accra", "Enseignant"),
        ("Fatima Traoré", "fatima@hodix.app", "Femme", "Mali", "Bamako", "Agricultrice"),
        ("Jean-Marc Tcheuko", "jean@hodix.app", "Homme", "Cameroun", "Bafoussam", "Mécanicien"),
        ("Esther Owusu", "esther@hodix.app", "Femme", "Côte d'Ivoire", "Abidjan", "Infirmière"),
        ("Mamadou Bâ", "mamadou@hodix.app", "Homme", "Sénégal", "Saint-Louis", "Pêcheur"),
        ("Chiamaka Eze", "chiamaka@hodix.app", "Femme", "Nigeria", "Lagos", "Étudiante"),
    ]
    for name, email, gender, country, city, occ in other_names:
        users.append({
            "id": gen_id(),
            "email": email,
            "full_name": name,
            "hashed_password": hash_password("Demo123!"),
            "role": Role.MEMBER.value,
            "is_active": True, "is_email_verified": True,
            "phone": f"+237 6{random.randint(80,99)} {random.randint(10,99)} {random.randint(10,99)} {random.randint(10,99)}",
            "gender": gender, "country": country, "city": city, "occupation": occ,
            "photo_base64": None,
            "created_at": now - timedelta(days=random.randint(30, 200)),
            "updated_at": now,
        })

    await db.users.insert_many(users)
    print(f"[seed] Created {len(users)} users")
    demo_id = demo_user["id"]

    # ---------------- SAVINGS GOALS for demo user ----------------
    goal1_id = gen_id()
    goal2_id = gen_id()
    goals = [
        {
            "id": goal1_id, "user_id": demo_id,
            "name": "Stock boutique 2026", "target_amount": 500000, "current_amount": 0,
            "deadline": now + timedelta(days=180),
            "savings_type": "flexible", "currency": "XAF",
            "note": "Pour renouveler le stock après la saison sèche.",
            "created_at": now - timedelta(days=90), "updated_at": now,
        },
        {
            "id": goal2_id, "user_id": demo_id,
            "name": "Scolarité enfants", "target_amount": 250000, "current_amount": 0,
            "deadline": now + timedelta(days=90),
            "savings_type": "locked", "currency": "XAF",
            "note": None,
            "created_at": now - timedelta(days=60), "updated_at": now,
        },
    ]
    await db.savings_goals.insert_many(goals)

    # Seed transactions
    txs = []
    total_goal1 = 0.0
    total_goal2 = 0.0
    for i in range(20):
        amt = random.choice([5000, 10000, 15000, 20000, 25000])
        d = now - timedelta(days=90 - i * 4)
        txs.append({
            "id": gen_id(), "goal_id": goal1_id, "user_id": demo_id,
            "amount": amt, "kind": "deposit", "note": None,
            "created_at": d,
        })
        total_goal1 += amt
    for i in range(12):
        amt = random.choice([10000, 15000, 20000])
        d = now - timedelta(days=60 - i * 5)
        txs.append({
            "id": gen_id(), "goal_id": goal2_id, "user_id": demo_id,
            "amount": amt, "kind": "deposit", "note": None,
            "created_at": d,
        })
        total_goal2 += amt
    await db.savings_transactions.insert_many(txs)
    await db.savings_goals.update_one({"id": goal1_id}, {"$set": {"current_amount": total_goal1}})
    await db.savings_goals.update_one({"id": goal2_id}, {"$set": {"current_amount": total_goal2}})
    print(f"[seed] Inserted {len(txs)} savings transactions")

    # ---------------- TONTINE ----------------
    tontine_id = gen_id()
    tontine = {
        "id": tontine_id, "name": "Tontine des Femmes de Bonabéri",
        "description": "Tontine mensuelle des commerçantes de Douala",
        "admin_id": demo_id, "contribution_amount": 25000,
        "frequency": "monthly", "max_members": 10, "currency": "XAF",
        "invite_code": "BONABERI",
        "current_cycle": 3, "members_count": 5,
        "total_collected": 375000.0, "is_active": True,
        "created_at": now - timedelta(days=100),
    }
    await db.tontines.insert_one(tontine)

    # Add 5 members (demo user + 4 others)
    selected = [demo_user] + random.sample(users[2:], 4)
    tontine_members = []
    for pos, u in enumerate(selected, 1):
        tontine_members.append({
            "id": gen_id(),
            "tontine_id": tontine_id,
            "user_id": u["id"],
            "full_name": u["full_name"],
            "role": "admin" if u["id"] == demo_id else "member",
            "rotation_position": pos,
            "has_received": pos <= 2,
            "received_at": now - timedelta(days=70 - pos * 30) if pos <= 2 else None,
            "joined_at": now - timedelta(days=100),
        })
    await db.tontine_members.insert_many(tontine_members)

    # Tontine contributions
    contribs = []
    for cycle in range(1, 4):
        for m in tontine_members:
            contribs.append({
                "id": gen_id(),
                "tontine_id": tontine_id,
                "user_id": m["user_id"],
                "full_name": m["full_name"],
                "amount": 25000,
                "cycle": cycle,
                "note": None,
                "recorded_by": demo_id,
                "created_at": now - timedelta(days=90 - cycle * 30),
            })
    await db.tontine_contributions.insert_many(contribs)
    print(f"[seed] Tontine with {len(tontine_members)} members and {len(contribs)} contributions")

    # ---------------- LARGE TONTINE owned by Manager ----------------
    big_id = gen_id()
    big_tontine = {
        "id": big_id, "name": "Tontine Communauté Yaoundé",
        "description": "Grande tontine communautaire gérée par Mariam — mensuelle",
        "admin_id": manager_user["id"], "contribution_amount": 50000,
        "frequency": "monthly", "max_members": 20, "currency": "XAF",
        "invite_code": "YAOUNDE",
        "current_cycle": 2, "members_count": 8,
        "total_collected": 800000.0, "is_active": True,
        "created_at": now - timedelta(days=80),
    }
    await db.tontines.insert_one(big_tontine)
    big_pool = [manager_user, demo_user] + random.sample(users[3:], 6)
    big_members = []
    for pos, u in enumerate(big_pool, 1):
        big_members.append({
            "id": gen_id(), "tontine_id": big_id, "user_id": u["id"],
            "full_name": u["full_name"],
            "role": "admin" if u["id"] == manager_user["id"] else "member",
            "rotation_position": pos,
            "has_received": pos == 1,
            "received_at": now - timedelta(days=60) if pos == 1 else None,
            "joined_at": now - timedelta(days=80 - pos * 3),
        })
    await db.tontine_members.insert_many(big_members)
    big_contribs = []
    for cycle in range(1, 3):
        for m in big_members:
            big_contribs.append({
                "id": gen_id(), "tontine_id": big_id, "user_id": m["user_id"],
                "full_name": m["full_name"], "amount": 50000, "cycle": cycle,
                "note": None, "recorded_by": manager_user["id"],
                "created_at": now - timedelta(days=60 - cycle * 30),
            })
    await db.tontine_contributions.insert_many(big_contribs)
    print(f"[seed] Big tontine YAOUNDE with {len(big_members)} members, {len(big_contribs)} contribs")

    # ---------------- ASSOCIATION ----------------
    assoc_id = gen_id()
    assoc = {
        "id": assoc_id, "name": "Association Solidarité Femmes",
        "description": "Entraide et formation pour femmes entrepreneures",
        "admin_id": demo_id, "membership_fee": 5000, "currency": "XAF",
        "invite_code": "SOLIDFEM", "members_count": 4,
        "total_collected": 80000.0,
        "created_at": now - timedelta(days=80),
    }
    await db.associations.insert_one(assoc)
    selected = [demo_user] + random.sample(users[2:], 3)
    assoc_members = []
    for u in selected:
        assoc_members.append({
            "id": gen_id(), "association_id": assoc_id, "user_id": u["id"],
            "full_name": u["full_name"],
            "role": "admin" if u["id"] == demo_id else "member",
            "joined_at": now - timedelta(days=80),
        })
    await db.association_members.insert_many(assoc_members)

    assoc_contribs = [
        {"id": gen_id(), "association_id": assoc_id, "user_id": m["user_id"],
         "full_name": m["full_name"], "amount": 5000, "purpose": "membership",
         "note": "Cotisation annuelle", "created_at": now - timedelta(days=70)}
        for m in assoc_members for _ in range(4)
    ]
    await db.association_contributions.insert_many(assoc_contribs)

    # ---------------- COMMUNITY FUND ----------------
    fund_id = gen_id()
    fund = {
        "id": fund_id, "owner_id": demo_id,
        "name": "Fonds d'Urgence Boutique", "description": "Pour imprévus",
        "target_amount": 200000, "current_balance": 80000,
        "total_collected": 80000, "total_withdrawn": 0,
        "currency": "XAF", "created_at": now - timedelta(days=40),
    }
    await db.community_funds.insert_one(fund)
    fund_txs = [
        {"id": gen_id(), "fund_id": fund_id, "amount": amt, "kind": "contribution",
         "note": None, "created_at": now - timedelta(days=40 - i * 5)}
        for i, amt in enumerate([20000, 15000, 25000, 10000, 10000])
    ]
    await db.community_fund_transactions.insert_many(fund_txs)

    # ---------------- NOTIFICATIONS ----------------
    notifs = [
        {"id": gen_id(), "user_id": demo_id, "title": "Bienvenue sur Hodix !",
         "body": "Votre identité financière commence ici.",
         "kind": "success", "is_read": False, "action_url": None,
         "created_at": now - timedelta(hours=1)},
        {"id": gen_id(), "user_id": demo_id, "title": "Score de confiance amélioré",
         "body": "Votre score Hodix a progressé grâce à vos dépôts réguliers.",
         "kind": "success", "is_read": False, "action_url": None,
         "created_at": now - timedelta(days=2)},
        {"id": gen_id(), "user_id": demo_id, "title": "Tontine — Cycle 3",
         "body": "Nouveau cycle de la Tontine Bonabéri démarré.",
         "kind": "info", "is_read": True, "action_url": None,
         "created_at": now - timedelta(days=5)},
    ]
    await db.notifications.insert_many(notifs)
    print("[seed] Notifications added")

    print("[seed] ✅ Done!")


if __name__ == "__main__":
    asyncio.run(seed())
