import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - PostQueue",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold mb-6">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Last updated: March 2026
      </p>

      <div className="prose prose-sm prose-neutral max-w-none space-y-6">
        <section>
          <h2 className="text-lg font-medium mb-2">What PostQueue Does</h2>
          <p className="text-sm leading-relaxed">
            PostQueue is a personal scheduling tool that lets you write and
            schedule posts to Substack and Threads. It stores your scheduled
            content and publishes it at the time you choose.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-2">Data We Collect</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>
              <strong>Account email</strong> — used for login via Supabase Auth
            </li>
            <li>
              <strong>Scheduled post content</strong> — the text you write,
              stored until posted then retained for your history
            </li>
            <li>
              <strong>Platform tokens</strong> — your Substack session cookie
              and Threads OAuth access token, encrypted at rest (AES-256-GCM)
              and used solely to publish posts on your behalf
            </li>
            <li>
              <strong>Threads analytics</strong> — public engagement metrics
              (views, likes, replies) fetched from the Threads API for posts
              you published through PostQueue
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-2">How We Use Your Data</h2>
          <p className="text-sm leading-relaxed">
            Your data is used exclusively to provide the scheduling service.
            We do not sell, share, or use your data for advertising. Platform
            tokens are only used to publish your scheduled posts and fetch
            your analytics.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-2">Data Storage</h2>
          <p className="text-sm leading-relaxed">
            All data is stored in Supabase (PostgreSQL) with row-level
            security. Platform tokens are encrypted before storage. The
            application is hosted on Railway.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-2">Third-Party Services</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>
              <strong>Supabase</strong> — database and authentication
            </li>
            <li>
              <strong>Railway</strong> — application hosting
            </li>
            <li>
              <strong>Meta/Threads API</strong> — posting and analytics (governed
              by{" "}
              <a
                href="https://www.facebook.com/privacy/policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Meta&apos;s Privacy Policy
              </a>
              )
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-2">Data Deletion</h2>
          <p className="text-sm leading-relaxed">
            You can disconnect your Threads account at any time from Settings,
            which deletes your stored token. You can delete any scheduled or
            posted note from the dashboard. To delete your account entirely,
            contact the administrator.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-medium mb-2">Contact</h2>
          <p className="text-sm leading-relaxed">
            For questions about this policy, contact the app administrator.
          </p>
        </section>
      </div>
    </div>
  );
}
