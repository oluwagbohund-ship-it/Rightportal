import React, { useState } from 'react';
import { Alert } from '../../components/ui/alert.tsx';
import { Button } from '../../components/ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx';
import { Input, Textarea } from '../../components/ui/input.tsx';
import { Label } from '../../components/ui/label.tsx';
import { apiRequest } from '../../lib/api.ts';

export function ContactPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await apiRequest<{ id: string; message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          organization,
          subject,
          message,
        }),
      });
      setSuccessMsg(res.message);
      setFullName('');
      setEmail('');
      setOrganization('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit inquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-4">
          <p className="text-xs font-semibold tracking-wider text-[#2563EB]">
            Contact Dave Timi EdTech Systems
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[#0F172A]">
            Connect with our engineering and onboarding team.
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Have questions about multi-school deployment, institutional verification, or Phase 2 academic integration? Submit your inquiry directly to our platform operations log.
          </p>
          <div className="border-t border-slate-200 pt-5 space-y-2 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-[#0F172A]">Architect & Developer:</span>{' '}
              David Oluwagbohun
            </p>
            <p>
              <span className="font-semibold text-[#0F172A]">Platform Tagline:</span>{' '}
              Build • Innovate • Transform
            </p>
          </div>
        </div>

        <div className="lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>Institutional Inquiry</CardTitle>
              <CardDescription>
                All inquiries are persisted and reviewed by authorized DT platform personnel.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
                {error ? <Alert variant="error">{error}</Alert> : null}
                {successMsg ? <Alert variant="success">{successMsg}</Alert> : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-name">Full Name</Label>
                    <Input
                      id="contact-name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Dr. Grace Adeyemi"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-email">Work Email</Label>
                    <Input
                      id="contact-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="principal@school.edu"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-org">School / Organization</Label>
                    <Input
                      id="contact-org"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact-subject">Subject</Label>
                    <Input
                      id="contact-subject"
                      required
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Institutional onboarding inquiry"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="contact-message">Message</Label>
                  <Textarea
                    id="contact-message"
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe your school's operational requirements..."
                  />
                </div>

                <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                  {submitting ? 'Submitting Inquiry...' : 'Send Inquiry'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
