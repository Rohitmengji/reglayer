"use client";

import { Shield, Mail, MessageSquare, MapPin } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    // Simulate form submission
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center gap-2 mb-12">
          <Link href="/" className="flex items-center gap-2 text-neutral-900 dark:text-white">
            <Shield className="h-5 w-5" />
            <span className="font-bold">RegLayer</span>
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">Contact Us</h1>
        <p className="text-neutral-500 dark:text-neutral-400 mb-10">
          Have a question, need enterprise pricing, or want to report an issue? We&apos;d love to hear from you.
        </p>

        <div className="grid gap-10 md:grid-cols-2">
          {/* Contact Info */}
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white">Email</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  General: <a href="mailto:hello@reglayer.dev" className="text-blue-600 hover:underline">hello@reglayer.dev</a>
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Support: <a href="mailto:support@reglayer.dev" className="text-blue-600 hover:underline">support@reglayer.dev</a>
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  Sales: <a href="mailto:sales@reglayer.dev" className="text-blue-600 hover:underline">sales@reglayer.dev</a>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white">Response Time</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  We typically respond within 24 hours on business days. Enterprise customers receive priority support.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-neutral-600 dark:text-neutral-400 mt-0.5" />
              <div>
                <h3 className="font-medium text-neutral-900 dark:text-white">Location</h3>
                <p className="text-sm text-neutral-600 dark:text-neutral-300">
                  RegLayer GmbH<br />
                  Frankfurt am Main, Germany<br />
                  EU-hosted infrastructure
                </p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-6">
            {submitted ? (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                  <Mail className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">
                  Message Sent
                </h3>
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Thanks for reaching out! We&apos;ll get back to you within 24 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    type="text"
                    required
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                    placeholder="you@company.com"
                  />
                </div>
                <div>
                  <label htmlFor="subject" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Subject
                  </label>
                  <select
                    id="subject"
                    name="subject"
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
                  >
                    <option value="general">General Inquiry</option>
                    <option value="support">Technical Support</option>
                    <option value="enterprise">Enterprise Pricing</option>
                    <option value="partnership">Partnership</option>
                    <option value="bug">Bug Report</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={4}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white resize-none"
                    placeholder="How can we help?"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Sending..." : "Send Message"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
