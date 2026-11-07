# AdSense operations checklist

The repository now sets Consent Mode v2 defaults to `denied` before Google tags load. This is a safe default, not a replacement for a Google-certified consent management platform.

Before production rollout:

1. In AdSense, open **Privacy & messaging** and publish a Google-certified GDPR message for EEA, UK and Switzerland visitors. Include consent, reject and manage-options choices.
2. Add the applicable US state regulations message.
3. In **Ads → By site → FitMyPic**, review Auto ads and exclude the upload controls, editor workspace, result preview, download actions, cookie/privacy pages, error pages and 404 page.
4. Disable overlay, anchor or interstitial formats that cover editor controls on small screens.
5. Keep ads outside the tool surface. Recommended content-only locations are between complete editorial sections, never beside upload or download buttons.
6. Verify `https://www.fitmypic.com/ads.txt`, the Policy Center, mobile layout shift and privacy-message behavior in an EEA test location.
7. Re-check the consent message after every major layout change.

Do not add manual ad units until their AdSense slot IDs are known. The existing publisher ID is `ca-pub-5633189368787002`.
