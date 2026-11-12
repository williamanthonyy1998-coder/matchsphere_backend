import "dotenv/config";
import { PrismaClient, UserStatus, RecordStatus, ListingIntent, MatchStatus, ConnectionStatus, SubscriptionStatus, DealStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const categories = [
    { name: "Real Estate", slug: "real-estate", attrs: ["propertyType", "bedrooms", "size"] },
    { name: "Vehicles", slug: "vehicles", attrs: ["make", "model", "year", "mileage"] },
    { name: "Products & Wholesale", slug: "products-wholesale", attrs: ["productType", "quantity", "condition"] },
    { name: "Services", slug: "services", attrs: ["serviceType", "expertise", "availability"] },
    { name: "Jobs & Recruitment", slug: "jobs-recruitment", attrs: ["jobType", "skills", "experience"] },
    { name: "Business Opportunities", slug: "business-opportunities", attrs: ["industry", "investmentSize", "opportunityType"] },
  ];

  const categoryMap: Record<string, string> = {};
  for (const [index, item] of categories.entries()) {
    const category = await prisma.category.upsert({
      where: { slug: item.slug },
      update: { name: item.name, isActive: true, sortOrder: index + 1 },
      create: { name: item.name, slug: item.slug, isActive: true, sortOrder: index + 1 },
    });
    categoryMap[item.slug] = category.id;

    for (const key of item.attrs) {
      const label = key.replace(/[A-Z]/g, (m) => ` ${m}`).replace(/^./, (m) => m.toUpperCase());
      await prisma.categoryAttribute.upsert({
        where: { categoryId_key: { categoryId: category.id, key } },
        update: { label, isMatchable: true },
        create: { categoryId: category.id, key, label, dataType: "TEXT", isMatchable: true },
      });
    }
  }

  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { code: "FREE" },
    update: {},
    create: { name: "Free", code: "FREE", price: 0, currency: "USD", interval: "MONTH", features: { listings: 3, requirements: 3, basicMatching: true } },
  });

  const adminEmail = (process.env.MATCHSPHERE_ADMIN_EMAIL || "admin@matchsphere.com").trim().toLowerCase();
  const adminPassword = process.env.MATCHSPHERE_ADMIN_PASSWORD || "MatchSphere@2026";
  if (adminPassword.length < 12) throw new Error("MATCHSPHERE_ADMIN_PASSWORD must contain at least 12 characters.");
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { passwordHash, firstName: "MatchSphere", lastName: "Administrator", role: "ADMIN", status: UserStatus.ACTIVE },
    create: { email: adminEmail, passwordHash, firstName: "MatchSphere", lastName: "Administrator", role: "ADMIN", status: UserStatus.ACTIVE, countryCode: "US" },
  });

  await prisma.subscription.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    update: { userId: admin.id, planId: freePlan.id, status: SubscriptionStatus.ACTIVE },
    create: { id: "00000000-0000-4000-8000-000000000001", userId: admin.id, planId: freePlan.id, status: SubscriptionStatus.ACTIVE },
  });

  // Demo marketplace accounts. All are synthetic test users, not real people.
  const demoPassword = process.env.MATCHSPHERE_DEMO_PASSWORD || "DemoUser@2026";
  const demoHash = await bcrypt.hash(demoPassword, 12);
  const demoUsers = [
    { email: "demo.property@matchsphere.com", firstName: "Ava", lastName: "Property", countryCode: "US", city: "Austin" },
    { email: "demo.vehicles@matchsphere.com", firstName: "Noah", lastName: "Motors", countryCode: "US", city: "Dallas" },
    { email: "demo.wholesale@matchsphere.com", firstName: "Mia", lastName: "Wholesale", countryCode: "GB", city: "London" },
    { email: "demo.services@matchsphere.com", firstName: "Liam", lastName: "Services", countryCode: "AE", city: "Dubai" },
    { email: "demo.jobs@matchsphere.com", firstName: "Sophia", lastName: "Talent", countryCode: "US", city: "Houston" },
    { email: "demo.business@matchsphere.com", firstName: "Ethan", lastName: "Ventures", countryCode: "SG", city: "Singapore" },
  ];
  const sellers: Record<string, { id: string }> = {};
  for (const demo of demoUsers) {
    const { city: _demoCity, ...userData } = demo;
    sellers[demo.email] = await prisma.user.upsert({
      where: { email: demo.email },
      update: { passwordHash: demoHash, firstName: demo.firstName, lastName: demo.lastName, countryCode: demo.countryCode, role: "USER", status: UserStatus.ACTIVE },
      create: { ...userData, passwordHash: demoHash, role: "USER", status: UserStatus.ACTIVE },
    });
  }

  const examples = [
    {
      slug: "real-estate", email: "demo.property@matchsphere.com", intent: ListingIntent.OFFER,
      title: "Modern 3-bedroom family home in Austin", description: "Move-in-ready family home in a popular Austin neighborhood, close to schools, parks and major roads.",
      countryCode: "US", city: "Austin", region: "Texas", price: 425000, currency: "USD", attrs: { propertyType: "House", bedrooms: "3", size: "2100 sqft" },
      reqTitle: "Looking for a 3-bedroom home in Austin", reqDescription: "Seeking a family home in Austin with at least three bedrooms and a practical commute.", min: 350000, max: 475000, reqAttrs: { propertyType: "House", bedrooms: "3" },
    },
    {
      slug: "vehicles", email: "demo.vehicles@matchsphere.com", intent: ListingIntent.OFFER,
      title: "2022 Toyota Camry SE – excellent condition", description: "Well-maintained 2022 Toyota Camry SE with service history, clean interior and low mileage.",
      countryCode: "US", city: "Dallas", region: "Texas", price: 24500, currency: "USD", attrs: { make: "Toyota", model: "Camry", year: "2022", mileage: "28000 miles" },
      reqTitle: "Buyer seeking a 2021–2023 Toyota Camry", reqDescription: "Looking for a reliable Toyota Camry in good condition with documented service history.", min: 20000, max: 28000, reqAttrs: { make: "Toyota", model: "Camry", year: "2022" },
    },
    {
      slug: "products-wholesale", email: "demo.wholesale@matchsphere.com", intent: ListingIntent.OFFER,
      title: "Wholesale organic cotton T-shirts – 500 units", description: "Wholesale lot of premium organic cotton T-shirts, multiple sizes, consistent quality and export-ready packaging.",
      countryCode: "GB", city: "London", region: "Greater London", price: 4500, currency: "USD", attrs: { productType: "Organic cotton T-shirts", quantity: "500", condition: "New" },
      reqTitle: "Wholesale supplier for 500 organic cotton T-shirts", reqDescription: "Seeking a dependable supplier for a 500-piece organic cotton T-shirt order.", min: 3500, max: 5500, reqAttrs: { productType: "Organic cotton T-shirts", quantity: "500" },
    },
    {
      slug: "services", email: "demo.services@matchsphere.com", intent: ListingIntent.SERVICE_OFFER,
      title: "B2B digital marketing and SEO services", description: "Experienced team offering technical SEO, content strategy and paid campaign management for growing businesses.",
      countryCode: "AE", city: "Dubai", region: "Dubai", price: 1800, currency: "USD", attrs: { serviceType: "Digital Marketing", expertise: "SEO", availability: "Immediate" },
      reqTitle: "Business looking for an SEO service partner", reqDescription: "Need an experienced SEO partner for a growing B2B company, with monthly reporting.", min: 1200, max: 2500, reqAttrs: { serviceType: "Digital Marketing", expertise: "SEO" },
    },
    {
      slug: "jobs-recruitment", email: "demo.jobs@matchsphere.com", intent: ListingIntent.JOB_OPENING,
      title: "Senior React Developer – Remote", description: "Remote senior frontend role for a product team building modern web applications with React and JavaScript.",
      countryCode: "US", city: "Houston", region: "Texas", price: 115000, currency: "USD", attrs: { jobType: "Full-time", skills: "React, JavaScript", experience: "5+ years" },
      reqTitle: "Seeking a remote senior React developer role", reqDescription: "Experienced frontend developer seeking a full-time remote opportunity focused on React.", min: 95000, max: 125000, reqAttrs: { jobType: "Full-time", skills: "React, JavaScript" },
    },
    {
      slug: "business-opportunities", email: "demo.business@matchsphere.com", intent: ListingIntent.PARTNERSHIP_OFFER,
      title: "SaaS distribution partnership opportunity", description: "Seeking regional distribution partners for a growing B2B SaaS product, with onboarding and sales enablement support.",
      countryCode: "SG", city: "Singapore", region: "Central Region", price: 50000, currency: "USD", attrs: { industry: "Technology / SaaS", investmentSize: "25000-50000 USD", opportunityType: "Distribution Partnership" },
      reqTitle: "Looking for a SaaS distribution partner", reqDescription: "Interested in partnering with a technology company for regional SaaS distribution.", min: 25000, max: 60000, reqAttrs: { industry: "Technology / SaaS", opportunityType: "Distribution Partnership" },
    },
  ];

  const seededMatches: Array<{ id: string; requirementId: string; listingId: string; buyerId: string; sellerId: string }> = [];
  for (const item of examples) {
    const categoryId = categoryMap[item.slug];
    const seller = sellers[item.email];

    const listingExisting = await prisma.listing.findFirst({ where: { ownerId: seller.id, title: item.title } });
    const listing = listingExisting
      ? await prisma.listing.update({ where: { id: listingExisting.id }, data: { categoryId, intent: item.intent, description: item.description, countryCode: item.countryCode, region: item.region, city: item.city, price: item.price, currency: item.currency, isNegotiable: true, attributes: item.attrs, status: RecordStatus.APPROVED } })
      : await prisma.listing.create({ data: { ownerId: seller.id, categoryId, intent: item.intent, title: item.title, description: item.description, countryCode: item.countryCode, region: item.region, city: item.city, price: item.price, currency: item.currency, isNegotiable: true, attributes: item.attrs, status: RecordStatus.APPROVED } });

    const reqExisting = await prisma.requirement.findFirst({ where: { ownerId: admin.id, title: item.reqTitle } });
    const requirement = reqExisting
      ? await prisma.requirement.update({ where: { id: reqExisting.id }, data: { categoryId, intent: item.slug === "services" ? ListingIntent.SERVICE_REQUEST : item.slug === "jobs-recruitment" ? ListingIntent.JOB_APPLICATION : item.slug === "business-opportunities" ? ListingIntent.PARTNERSHIP_REQUEST : ListingIntent.REQUEST, description: item.reqDescription, countryCode: item.countryCode, region: item.region, city: item.city, minPrice: item.min, maxPrice: item.max, currency: item.currency, attributes: item.reqAttrs, status: RecordStatus.APPROVED } })
      : await prisma.requirement.create({ data: { ownerId: admin.id, categoryId, intent: item.slug === "services" ? ListingIntent.SERVICE_REQUEST : item.slug === "jobs-recruitment" ? ListingIntent.JOB_APPLICATION : item.slug === "business-opportunities" ? ListingIntent.PARTNERSHIP_REQUEST : ListingIntent.REQUEST, title: item.reqTitle, description: item.reqDescription, countryCode: item.countryCode, region: item.region, city: item.city, minPrice: item.min, maxPrice: item.max, currency: item.currency, attributes: item.reqAttrs, status: RecordStatus.APPROVED } });

    const match = await prisma.match.upsert({
      where: { requirementId_listingId: { requirementId: requirement.id, listingId: listing.id } },
      update: { score: 94, status: MatchStatus.PENDING_REVIEW, explanation: { matched: ["Category", "Country", "City", "Budget", "Attributes"], seedDemo: true } },
      create: { requirementId: requirement.id, listingId: listing.id, buyerId: admin.id, sellerId: seller.id, score: 94, status: MatchStatus.PENDING_REVIEW, explanation: { matched: ["Category", "Country", "City", "Budget", "Attributes"], seedDemo: true } },
    });
    seededMatches.push(match);
  }

  // Add a few admin-owned submissions so the moderation queue has sample records.
  const pendingListingTitle = "Demo listing awaiting moderation – premium office furniture";
  const pendingListingExisting = await prisma.listing.findFirst({ where: { ownerId: admin.id, title: pendingListingTitle } });
  if (pendingListingExisting) {
    await prisma.listing.update({ where: { id: pendingListingExisting.id }, data: { status: RecordStatus.PENDING_REVIEW } });
  } else {
    await prisma.listing.create({ data: { ownerId: admin.id, categoryId: categoryMap["products-wholesale"], intent: ListingIntent.OFFER, title: pendingListingTitle, description: "Sample office furniture listing added for testing the review workflow.", countryCode: "US", city: "Austin", price: 3200, currency: "USD", status: RecordStatus.PENDING_REVIEW, attributes: { productType: "Office furniture", quantity: "20", condition: "New" } } });
  }

  const pendingReqTitle = "Demo request awaiting moderation – commercial office space";
  const pendingReqExisting = await prisma.requirement.findFirst({ where: { ownerId: admin.id, title: pendingReqTitle } });
  if (pendingReqExisting) {
    await prisma.requirement.update({ where: { id: pendingReqExisting.id }, data: { status: RecordStatus.PENDING_REVIEW } });
  } else {
    await prisma.requirement.create({ data: { ownerId: admin.id, categoryId: categoryMap["real-estate"], intent: ListingIntent.REQUEST, title: pendingReqTitle, description: "Sample requirement for testing the admin moderation workflow.", countryCode: "US", city: "Austin", minPrice: 2000, maxPrice: 5000, currency: "USD", status: RecordStatus.PENDING_REVIEW, attributes: { propertyType: "Office", size: "2000 sqft" } } });
  }

  // Seed one mutually accepted connection and a sample deal for the first match.
  const firstMatch = seededMatches[0];
  if (firstMatch) {
    const connection = await prisma.connection.upsert({
      where: { matchId: firstMatch.id },
      update: { status: ConnectionStatus.ACTIVE },
      create: { matchId: firstMatch.id, status: ConnectionStatus.ACTIVE },
    });
    for (const userId of [firstMatch.buyerId, firstMatch.sellerId]) {
      await prisma.connectionParticipant.upsert({
        where: { connectionId_userId: { connectionId: connection.id, userId } },
        update: { acceptedAt: new Date(), declinedAt: null },
        create: { connectionId: connection.id, userId, acceptedAt: new Date() },
      });
    }
    await prisma.match.update({ where: { id: firstMatch.id }, data: { status: MatchStatus.CONNECTED } });
    const existingDeal = await prisma.deal.findFirst({ where: { connectionId: connection.id, title: "Austin home purchase – demo deal" } });
    if (!existingDeal) {
      await prisma.deal.create({
        data: { connectionId: connection.id, createdById: admin.id, title: "Austin home purchase – demo deal", dealValue: 425000, currency: "USD", status: DealStatus.DISCUSSION },
      });
    }
  }

  console.log("MatchSphere seed completed with demo marketplace data.");
  console.log(`Admin login: ${adminEmail}`);
  console.log("Admin password: value of MATCHSPHERE_ADMIN_PASSWORD in api/.env (local default: MatchSphere@2026)");
  console.log(`Demo seller accounts: ${demoUsers.length}; listings: ${examples.length}; admin requirements: ${examples.length}; matches: ${seededMatches.length}`);
  console.log(`Demo account password for all demo sellers: ${demoPassword}`);
}

main()
  .catch((error) => {
    console.error("MatchSphere seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
