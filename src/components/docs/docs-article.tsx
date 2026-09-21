import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PublicHeader } from "@/components/layout/public-header";
import { Footer } from "@/components/layout/footer";
import { DOC_GUIDES, DOC_PLAN_ROWS, type DocGuide } from "@/lib/docs/content";
import { breadcrumbSchema, publicMetadata } from "@/lib/seo";

export function getGuideMetadata(slug: string) {
  const guide = DOC_GUIDES.find(candidate => candidate.slug === slug);
  if (!guide) notFound();
  return publicMetadata(`/docs/${slug}`, `${guide.title} Guide`, guide.summary);
}

export function DocsGuide({ slug }: { slug: string }) {
  const guide = DOC_GUIDES.find(candidate => candidate.slug === slug);
  if (!guide) notFound();
  return <DocsArticle guide={guide} />;
}

export function DocsArticle({ guide }: { guide: DocGuide }) {
  return <div className="min-h-screen bg-white dark:bg-neutral-950">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema([{ name: "RegLayer", path: "/" }, { name: "Documentation", path: "/docs" }, { name: guide.title, path: `/docs/${guide.slug}` }])).replace(/</g, "\\u003c") }} />
    <PublicHeader />
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/docs" className="inline-flex min-h-10 items-center gap-2 text-sm text-neutral-600 hover:underline dark:text-neutral-300"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Documentation</Link>
      <header className="mt-4 border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">{guide.title}</h1>
        <p className="mt-3 max-w-2xl text-neutral-600 dark:text-neutral-300">{guide.summary}</p>
        <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">Reviewed <time dateTime={guide.reviewedAt}>{guide.reviewedAt}</time></p>
      </header>
      <div className="mt-8 grid min-w-0 gap-10 md:grid-cols-[12rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="self-start border-l border-neutral-200 pl-4 dark:border-neutral-700 md:sticky md:top-20">
          <p className="text-sm font-semibold text-neutral-900 dark:text-white">On this page</p>
          <ul className="mt-2 space-y-1">
            <li><a href="#quick-start" className="block py-2 text-sm text-neutral-600 hover:underline dark:text-neutral-300">Quick start</a></li>
            {guide.sections.map(section => <li key={section.id}><a href={`#${section.id}`} className="block py-2 text-sm text-neutral-600 hover:underline dark:text-neutral-300">{section.title}</a></li>)}
          </ul>
        </nav>
        <article className="min-w-0 space-y-9 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
          <section id="quick-start" className="scroll-mt-24 border-b border-neutral-200 pb-6 dark:border-neutral-800">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">Quick start</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5">{guide.quickStart.map(step => <li key={step}>{step}</li>)}</ol>
          </section>
          {guide.sections.map(section => <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">{section.title}</h2>
            {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-3">{paragraph}</p>)}
            {section.steps && <ol className="mt-3 list-decimal space-y-2 pl-5">{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}
            {section.code && <pre role="region" tabIndex={0} aria-label={`${section.title} example`} className="mt-4 max-w-full overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-6 dark:border-neutral-700 dark:bg-neutral-900"><code>{section.code}</code></pre>}
            {section.limits && <div className="mt-4 max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label="Configured plan limits">
              <table style={{ display: "table", overflow: "visible" }} className="w-full min-w-[32rem] text-left text-sm">
                <caption className="mb-2 text-left font-medium">Base plan configuration</caption>
                <thead><tr>{["Plan", "Scans / month", "Pages / scan", "Members", "Audit days"].map(label => <th key={label} scope="col" className="border-b border-neutral-200 p-2 dark:border-neutral-700">{label}</th>)}</tr></thead>
                <tbody>{DOC_PLAN_ROWS.map(row => <tr key={row.plan}><th scope="row" className="border-b border-neutral-200 p-2 dark:border-neutral-800">{row.plan}</th>{[row.scans,row.pages,row.members,row.auditDays].map((value,index) => <td key={index} className="border-b border-neutral-200 p-2 dark:border-neutral-800">{value === -1 ? "Unlimited quota" : value}</td>)}</tr>)}</tbody>
              </table>
            </div>}
            {section.links && <ul className="mt-4 grid gap-2 sm:grid-cols-2">{section.links.map(link => <li key={link.href}><Link href={link.href} className="inline-flex min-h-10 items-center gap-1 py-2 font-medium text-blue-700 underline underline-offset-4 dark:text-blue-300">{link.label}<ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></Link></li>)}</ul>}
          </section>)}
        </article>
      </div>
      <nav aria-label="Other guides" className="mt-12 grid gap-2 border-t border-neutral-200 pt-5 dark:border-neutral-800 sm:grid-cols-2 lg:grid-cols-3">{DOC_GUIDES.filter(doc => doc.slug !== guide.slug).map(doc => <Link key={doc.slug} href={`/docs/${doc.slug}`} className="block py-3 text-sm font-medium text-neutral-700 hover:underline dark:text-neutral-300">{doc.title}</Link>)}</nav>
    </main>
    <Footer />
  </div>;
}