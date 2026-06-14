import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const email = "demo@openreview.local";
const password = "openreview-demo";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Demo seed is blocked in production. Set ALLOW_DEMO_SEED=true only for intentional demo environments."
    );
  }

  if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    throw new Error("JWT_SECRET must be at least 32 characters before seeding production.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      name: "Demo Editor",
      passwordHash
    }
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "demo-studio" },
    update: {},
    create: {
      name: "Demo Studio",
      slug: "demo-studio",
      members: {
        create: {
          userId: user.id,
          role: "OWNER"
        }
      }
    }
  });

  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: {
        userId: user.id,
        organizationId: organization.id
      }
    },
    update: { role: "OWNER" },
    create: {
      userId: user.id,
      organizationId: organization.id,
      role: "OWNER"
    }
  });

  const project = await prisma.project.upsert({
    where: { id: "demo-project" },
    update: {},
    create: {
      id: "demo-project",
      name: "Launch Film Review",
      organizationId: organization.id
    }
  });

  console.log("Seeded demo account", { email, password, organizationId: organization.id, projectId: project.id });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
