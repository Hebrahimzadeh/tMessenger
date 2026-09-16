-- NOTE: Prisma's diff proposed `DROP INDEX "spaces_search_text_trgm_idx"`
-- again - the recurring false positive (it cannot see the hand-added
-- pg_trgm GIN index from 20260905152927_space_search). Deliberately
-- removed; dropping it would silently kill Task 11's search performance.

-- CreateEnum
CREATE TYPE "PolicySeverity" AS ENUM ('NORMAL', 'REVIEW', 'SEVERE');

-- CreateTable
CREATE TABLE "policy_definitions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "example" TEXT NOT NULL,
    "severity" "PolicySeverity" NOT NULL,
    "matchTerms" TEXT[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policy_definitions_key_key" ON "policy_definitions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "policy_versions_definitionId_version_key" ON "policy_versions"("definitionId", "version");

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "policy_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The baseline policy, seeded here rather than by application code, because
-- "baseline policy را immutable و فقط از migration/seed بازبینی‌شده بساز".
-- Nothing in the running system writes to these tables; a changed rule is a
-- new version in a new migration that somebody reviews. Task 30 adds the
-- moderator-facing path, with its own review.
--
-- Every SEVERE rule below names a law or published policy in `source` and a
-- concrete case in `example`. That is a hard requirement rather than
-- documentation: only a SEVERE rule can produce a BLOCK, and a BLOCK nobody
-- can explain by pointing at something is not one anybody can apply
-- consistently or contest fairly.
--
-- There is deliberately no rule about disagreement, criticism, satire or
-- scholarly citation. Those are not violations, and the guidance sends them
-- to a human instead - see space-guidance.ts's ambiguity signals.

INSERT INTO "policy_definitions" ("id", "key") VALUES
  ('a0000000-0000-4000-8000-000000000001', 'gambling'),
  ('a0000000-0000-4000-8000-000000000002', 'fraud'),
  ('a0000000-0000-4000-8000-000000000003', 'weapons_trade'),
  ('a0000000-0000-4000-8000-000000000004', 'narcotics'),
  ('a0000000-0000-4000-8000-000000000005', 'discrimination'),
  ('a0000000-0000-4000-8000-000000000006', 'guaranteed_return'),
  ('a0000000-0000-4000-8000-000000000007', 'public_fundraising'),
  ('a0000000-0000-4000-8000-000000000008', 'medical_claim');

INSERT INTO "policy_versions" ("id", "definitionId", "version", "title", "source", "example", "severity", "matchTerms") VALUES
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 1,
   'سازمان‌دهی قمار و شرط‌بندی',
   'قانون مجازات اسلامی، مواد ۷۰۵ تا ۷۱۱',
   'بستری برای گرداندن مسابقهٔ شرط‌بندی روی نتیجهٔ بازی‌ها. شامل بازی رومیزی بدون شرط‌بندی نمی‌شود.',
   'SEVERE', ARRAY['قمار', 'شرط‌بندی', 'شرط بندی']),

  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 1,
   'کلاهبرداری و تحصیل مال از راه نامشروع',
   'قانون تشدید مجازات مرتکبین ارتشا، اختلاس و کلاهبرداری، مادهٔ ۱',
   'بستری که با وعدهٔ دروغ سرمایه جمع می‌کند. شامل انتقاد از یک کسب‌وکار نمی‌شود.',
   'SEVERE', ARRAY['کلاهبرداری', 'پانزی', 'هرمی']),

  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 1,
   'خرید و فروش سلاح',
   'قانون مجازات قاچاق اسلحه و مهمات، مادهٔ ۲',
   'بستری برای واسطه‌گری فروش سلاح گرم. شامل گفت‌وگو دربارهٔ ایمنی شکار نمی‌شود.',
   'SEVERE', ARRAY['فروش اسلحه', 'خرید اسلحه', 'سلاح گرم']),

  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 1,
   'مواد مخدر و روان‌گردان',
   'قانون مبارزه با مواد مخدر، مادهٔ ۴',
   'بستری برای تهیه یا توزیع مواد مخدر. شامل بستر ترک اعتیاد و حمایت از بهبودی نمی‌شود.',
   'SEVERE', ARRAY['مواد مخدر', 'توزیع مواد']),

  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000005', 1,
   'محروم‌کردن بر پایهٔ قومیت، مذهب، جنسیت یا معلولیت',
   'قانون اساسی جمهوری اسلامی ایران، اصل نوزدهم',
   'بستری که مشارکت را برای یک قومیت ممنوع می‌کند. شامل بستری که ویژهٔ یک گروه تشکیل شده ولی کسی را محروم نمی‌کند، نمی‌شود.',
   'SEVERE', ARRAY['فقط برای فارس‌ها', 'ورود اقلیت ممنوع', 'مخصوص یک قوم']),

  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000006', 1,
   'وعدهٔ سود تضمین‌شده',
   'سیاست پلتفرم: هیچ بستری نباید بازده مالی تضمین کند',
   'بستری که «سود ماهانه تضمینی» تبلیغ می‌کند. یک صندوق قرض‌الحسنهٔ شفاف بدون وعدهٔ بازده مشمول نیست.',
   'REVIEW', ARRAY['تضمین سود', 'سود تضمینی', 'بازده تضمین']),

  ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000007', 1,
   'جمع‌آوری کمک مالی عمومی',
   'قانون نحوهٔ فعالیت مؤسسات خیریه؛ نیازمند مجوز',
   'بستری که از عموم پول جمع می‌کند. هماهنگی کمک غیرنقدی مانند ارزاق مشمول بررسی سبک‌تری است.',
   'REVIEW', ARRAY['جمع‌آوری کمک مالی', 'جمع آوری پول', 'واریز به حساب']),

  ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000008', 1,
   'ادعای درمانی و دارویی',
   'قانون مربوط به مقررات امور پزشکی و دارویی، مادهٔ ۳',
   'بستری که «درمان قطعی» ارائه می‌دهد. بستر همیاری بیماران برای رفت‌وآمد به درمانگاه مشمول نیست.',
   'REVIEW', ARRAY['درمان قطعی', 'دارویی', 'شفای قطعی']);
