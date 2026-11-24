import React, { useState } from 'react';
import { PUBLIC_MEDIA, VisualMediaFrame } from '../../components/public/publicMedia.tsx';
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
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-stretch">
        <div className="lg:col-span-5 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-tight text-[#2563EB]">
              Contact Dave Timi EdTech Systems
            </p>
            <h1
              className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A] leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Connect with our engineering and onboarding team.
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
              Need an institutional School Access Code, a walkthrough for school leadership, or technical assistance? Send your message straight to our operations team.
            </p>
          </div>

          <VisualMediaFrame
            src={PUBLIC_MEDIA.campusHubImg}
            alt="Modern school administrative hub supporting school staff and learners"
            fallbackTitle="Dave Timi EdTech Onboarding Team"
            className="h-60 border border-slate-200"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 right-4 text-white text-xs space-y-0.5">
              <p className="font-semibold text-sm">David Oluwagbohun</p>
              <p className="text-blue-200">Founder &amp; Architect · Build • Innovate • Transform</p>
            </div>
          </VisualMediaFrame>
        </div>

        <div className="lg:col-span-7">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-xl">Institutional Inquiry</CardTitle>
              <CardDescription>
                All inquiries are persisted and reviewed directly by authorized platform personnel.
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

                <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
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
