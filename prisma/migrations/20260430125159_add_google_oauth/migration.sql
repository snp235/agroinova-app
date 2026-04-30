-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'aluno',
    "school" TEXT NOT NULL,
    "avatar" TEXT,
    "foodIndex" INTEGER,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "xp" INTEGER NOT NULL DEFAULT 0,
    "coletas" INTEGER NOT NULL DEFAULT 0,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActive" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "coletas", "createdAt", "email", "foodIndex", "id", "isAdmin", "lastActive", "name", "passwordHash", "role", "school", "status", "streak", "updatedAt", "xp") SELECT "avatar", "coletas", "createdAt", "email", "foodIndex", "id", "isAdmin", "lastActive", "name", "passwordHash", "role", "school", "status", "streak", "updatedAt", "xp" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
