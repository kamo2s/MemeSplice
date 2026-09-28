/** The supplied DNA mark is the first letter of the word, not a separate icon. */
export function BrandWordmark() {
  return <span className="splice-wordmark" role="img" aria-label="Splice">
    <span className="splice-wordmark-symbol" aria-hidden="true" />
    <span className="splice-wordmark-text" aria-hidden="true">plice</span>
  </span>;
}
