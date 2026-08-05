const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const products = [
    {
      title: "CrystalGlow Acrylic Frame",
      description:
        "A premium clear acrylic frame for portraits, anniversaries, and special gifts.",
      basePrice: 799,
      imageUrl: "/uploads/sample-frame-1.jpg",
    },
    {
      title: "Memora Desk Acrylic Frame",
      description:
        "A modern tabletop acrylic photo frame designed for home and office display.",
      basePrice: 999,
      imageUrl: "/uploads/sample-frame-2.jpg",
    },
    {
      title: "LuxeWall Acrylic Print",
      description:
        "A wall-ready acrylic photo panel with vibrant color depth and polished edges.",
      basePrice: 1499,
      imageUrl: "/uploads/sample-frame-3.jpg",
    },
  ];

  for (const product of products) {
    const existingProduct = await prisma.product.findFirst({
      where: { title: product.title },
      select: { id: true },
    });

    if (existingProduct) {
      await prisma.product.update({
        where: { id: existingProduct.id },
        data: product,
      });
    } else {
      await prisma.product.create({
        data: product,
      });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
