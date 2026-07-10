import type { ReactNode } from 'react';

const avatarCss = `
  .fp-avatar {
    display: grid !important;
    place-items: center !important;
    flex: 0 0 40px !important;
    width: 40px !important;
    min-width: 40px !important;
    max-width: 40px !important;
    height: 40px !important;
    min-height: 40px !important;
    max-height: 40px !important;
    overflow: hidden !important;
    border-radius: 999px !important;
    background: #efded5 !important;
    color: #7b4835 !important;
    font-size: .68rem !important;
    font-weight: 900 !important;
    line-height: 1 !important;
  }

  .fp-avatar.large {
    flex-basis: 44px !important;
    width: 44px !important;
    min-width: 44px !important;
    max-width: 44px !important;
    height: 44px !important;
    min-height: 44px !important;
    max-height: 44px !important;
  }

  .fp-avatar > img {
    display: block !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    height: 100% !important;
    min-height: 0 !important;
    max-height: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: inherit !important;
    object-fit: cover !important;
    object-position: center !important;
  }

  .fp-conversation-item,
  .fp-thread-header {
    min-width: 0 !important;
    overflow: hidden !important;
  }
`;

export default function CaixaDeEntradaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: avatarCss }} />
      {children}
    </>
  );
}
