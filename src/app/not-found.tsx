import Link from 'next/link';

export default function NotFound() {
  return (
    <>
      <header className="page-head">
        <span className="eyebrow">404</span>
        <h1>Nothing here</h1>
        <p className="lead">This page or investigation does not exist in the dataset.</p>
      </header>
      <div className="btn-row">
        <Link href="/investigations" className="btn btn-primary">
          Browse investigations
        </Link>
        <Link href="/" className="btn">
          Back to start
        </Link>
      </div>
    </>
  );
}
