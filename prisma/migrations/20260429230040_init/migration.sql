-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT,
    "garden" TEXT,
    "category" TEXT,
    "location" TEXT,
    "collectTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sciVerified" BOOLEAN DEFAULT false,
    "sciVerifiedBy" TEXT,
    "sciPopularName" TEXT,
    "sciScientificName" TEXT,
    "sciFamily" TEXT,
    "sciEcologicalInfo" TEXT,
    CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostLike" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    PRIMARY KEY ("postId", "userId"),
    CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostSave" (
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    PRIMARY KEY ("postId", "userId"),
    CONSTRAINT "PostSave_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Garden" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "school" TEXT NOT NULL,
    "territory" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsible" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT,
    "access" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GardenCultivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gardenId" TEXT NOT NULL,
    "cultivo" TEXT NOT NULL,
    CONSTRAINT "GardenCultivo_gardenId_fkey" FOREIGN KEY ("gardenId") REFERENCES "Garden" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Canteiro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gardenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fase" TEXT NOT NULL,
    "area" TEXT,
    "lastIrrigation" TEXT,
    "observations" TEXT,
    CONSTRAINT "Canteiro_gardenId_fkey" FOREIGN KEY ("gardenId") REFERENCES "Garden" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CanteiroCultivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canteiroId" TEXT NOT NULL,
    "cultivo" TEXT NOT NULL,
    CONSTRAINT "CanteiroCultivo_canteiroId_fkey" FOREIGN KEY ("canteiroId") REFERENCES "Canteiro" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GardenParticipant" (
    "gardenId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    PRIMARY KEY ("gardenId", "userId"),
    CONSTRAINT "GardenParticipant_gardenId_fkey" FOREIGN KEY ("gardenId") REFERENCES "Garden" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GardenParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "endTime" TEXT,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT NOT NULL,
    "address" TEXT,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "gardenId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Event_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Event_gardenId_fkey" FOREIGN KEY ("gardenId") REFERENCES "Garden" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventInterest" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    PRIMARY KEY ("eventId", "userId"),
    CONSTRAINT "EventInterest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "suggestedDate" TEXT,
    "description" TEXT,
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "rejectionMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSuggestion_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserMedal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "medalId" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserMedal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LeafEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeafEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FoodAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answer" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FoodAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserMedal_userId_medalId_key" ON "UserMedal"("userId", "medalId");
