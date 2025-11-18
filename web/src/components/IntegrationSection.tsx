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
  techStack: TechStackItem[];
  useCases: IntegrationUseCase[];
};

export default function IntegrationSection({ techStack, useCases }: IntegrationSectionProps) {
  return (
    <section className="integration-cta" aria-labelledby="integration-title">
      <div className="integration-inner">
        <span className="integration-pill">
          Integrate <span className="integration-brand">Cognito</span>
        </span>
        <div className="integration-layout">
          <div className="integration-column">
            <div className="integration-headline">
              <h2 id="integration-title">Bring the AI canvas into your product</h2>
              <p>
                Deliver real-time visual intelligence inside your app. Empower teams to sketch, annotate, and receive AI-crafted
                insights instantly whether they&rsquo;re solving equations, designing interfaces, or collaborating across
                devices.
              </p>
            </div>
            <div className="integration-rail">
              <div className="integration-stack-wrapper">
                <div className="integration-stack" aria-label="Supported tech stack">
                  {techStack.map(({ name, slug, icon }) => (
                    <div key={slug} className={`stack-chip ${slug}`}>
                      <span className="stack-chip__icon">{icon}</span>
                      <span className="stack-chip__label">{name}</span>
                    </div>
                  ))}
                  {techStack.map(({ name, slug, icon }) => (
                    <div key={`${slug}-dup`} className={`stack-chip ${slug}`}>
                      <span className="stack-chip__icon">{icon}</span>
                      <span className="stack-chip__label">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="integration-side">
            <div className="integration-usecases">
              {useCases.map((useCase) => (
                <article key={useCase.title} className="usecase-card">
                  <span className="usecase-icon" aria-hidden="true">
                    {useCase.icon}
                  </span>
                  <div className="usecase-content">
                    <h3>{useCase.title}</h3>
                    {useCase.blurb && <p>{useCase.blurb}</p>}
                  </div>
                </article>
              ))}
            </div>
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
      </div>
    </section>
  );
}

