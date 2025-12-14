import React from 'react';
import { ArrowUpRight } from 'lucide-react';

type TechStackItem = {
  name: string;
  slug: string;
  icon: React.ReactNode;
};

type IntegrationUseCase = {
  icon: string;
  title: string;
  blurb: string;
};

type IntegrationSectionProps = {
  techStack?: TechStackItem[];
  useCases?: IntegrationUseCase[];
};

export default function IntegrationSection({ techStack, useCases }: IntegrationSectionProps) {
  const headlineTitle = 'Bring the AI canvas into your product';
  const headlineBody =
    'Deliver real-time visual intelligence inside your app. Empower teams to sketch, annotate, and receive AI-crafted insights instantly whether they’re solving equations, designing interfaces, or collaborating across devices.';

  const stack = Array.isArray(techStack) ? techStack : [];
  const stackLoop = stack.length > 0 ? [...stack, ...stack] : [];
  const cards = Array.isArray(useCases) ? useCases : [];

  return (
    <section className="integration-cta">
      <div className="integration-inner">
        <div className="integration-layout">
          <div className="integration-column">
            <div className="integration-headline">
              <h2>{headlineTitle}</h2>
              <p>{headlineBody}</p>
            </div>

            {stackLoop.length > 0 && (
              <div className="integration-rail" aria-label="Tech stack">
                <div className="integration-stack-wrapper">
                  <div className="integration-stack" aria-hidden="true">
                    {stackLoop.map((item, idx) => (
                      <div key={`${item.slug}-${idx}`} className={`stack-chip ${item.slug}`}>
                        <span className="stack-chip__icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="stack-chip__label">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="integration-actions">
              <a
                className="btn accent integration-action"
                href="https://forms.gle/EunESTAMAMsato776"
                target="_blank"
                rel="noopener noreferrer"
                title="Request an integration"
              >
                INTEGRATE NOW
                <ArrowUpRight size={16} />
              </a>
            </div>
          </div>

          <div className="integration-side">
            {cards.length > 0 && (
              <div className="integration-usecases" aria-label="Features">
                {cards.map((c) => (
                  <div key={c.title} className="usecase-card">
                    <div className="usecase-icon" aria-hidden="true">
                      {c.icon}
                    </div>
                    <div className="usecase-content">
                      <h3>{c.title}</h3>
                      {/* <p>{c.blurb}</p> */}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

