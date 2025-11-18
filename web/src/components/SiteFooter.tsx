import React from 'react';
import { ArrowUpRight, Globe, Github, Linkedin, Mail } from 'lucide-react';

type SiteFooterProps = {
  logoImage: string;
  currentYear: number;
  onShowAbout: () => void;
  onShowHow: () => void;
};

export default function SiteFooter({ logoImage, currentYear, onShowAbout, onShowHow }: SiteFooterProps) {
  return (
    <footer className="app-footer">
      <div className="footer-shell">
        <div className="footer-grid">
          <div className="footer-brand">
            <span className="footer-badge">Built for labs &amp; lecture halls</span>
            <div className="footer-logo" aria-hidden="true">
              <img src={logoImage} alt="Cognito logo" width={120} height={32} loading="lazy" decoding="async" />
            </div>
            <p className="footer-copy">
              Sketch complex ideas, annotate experiments, and ship insights faster with an AI-native canvas designed for science
              and engineering teams.
            </p>
            <div className="footer-actions">
              <a
                className="btn-cta footer-cta"
                href="https://forms.gle/gzvFHB3RdxW71o9t6"
                target="_blank"
                rel="noopener noreferrer"
              >
                Join the beta
                <ArrowUpRight size={16} />
              </a>
              <div className="footer-social">
                <a
                  className="footer-social-link"
                  href="https://www.linkedin.com/in/rohanbsonawane/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Connect on LinkedIn"
                >
                  <Linkedin size={16} />
                </a>
                <a
                  className="footer-social-link"
                  href="https://www.rohansonawane.tech/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Visit portfolio"
                >
                  <Globe size={16} />
                </a>
                <a
                  className="footer-social-link"
                  href="https://github.com/rohansonawane/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View GitHub profile"
                >
                  <Github size={16} />
                </a>
              </div>
            </div>
          </div>

          <div className="footer-nav-group">
            <span className="footer-nav-title">Quick links</span>
            <ul className="footer-nav-list">
              <li>
                <button type="button" className="footer-link" onClick={onShowAbout}>
                  Overview
                </button>
              </li>
              <li>
                <button type="button" className="footer-link" onClick={onShowHow}>
                  How it works
                </button>
              </li>
              <li>
                <a className="footer-link" href="mailto:rohansonawane28@gmail.com">
                  Email support
                </a>
              </li>
              <li>
                <a className="footer-link" href="https://forms.gle/gzvFHB3RdxW71o9t6" target="_blank" rel="noopener noreferrer">
                  Feedback
                </a>
              </li>
            </ul>
          </div>

          <div className="footer-card">
            <span className="footer-card-title">Stay in the loop</span>
            <p>Monthly drops on new lab-ready brushes, equation templates, and AI workflows tailored for research teams.</p>
            <a className="footer-mail" href="mailto:rohansonawane28@gmail.com">
              <Mail size={16} />
              rohansonawane28@gmail.com
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="footer-bottom-copy">
            © {currentYear} Cognito Labs · Built with <span className="heart-anim">♥</span>
          </span>
        </div>
      </div>
    </footer>
  );
}

