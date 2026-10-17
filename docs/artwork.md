# Integration cover

The repository-root `cover.png` is the integration's prepared catalog artwork:

- PNG, RGB, opaque, exactly **800 × 534 pixels**.
- **37,187 bytes**, below Gladys' 150 KB limit.
- Flat background **#00ACEC** (RGB 0, 172, 236).
- Centered white text in a neutral sans-serif: smaller `Busch & Jäger` above
  larger `free@home`, spanning about 69% of the canvas width.
  No icon or reproduced manufacturer logo. This independent community-integration
  artwork was generated for the project, not traced from the official app icon.
- After generation, the foreground was centered and composited onto the exact
  flat blue background, resized to the required dimensions and losslessly
  compressed. Only antialiased edges introduce intermediate colors.

## References and branding

The blue was sampled from the current official Busch-free@home Next app icon
linked by the manufacturer's [app page](https://www.busch-jaeger.de/apps/busch-freehome-next-app)
through the [App Store listing](https://apps.apple.com/de/app/busch-free-home-next/id1501808668).
This is a sampled asset color, not a verified corporate color specification.
The manufacturer's stacked lettering, enclosing emblem and ABB/Busch-Jaeger
wordmarks were not copied into this asset.

The name identifies compatibility with the free@home system; the integration
is not affiliated with or endorsed by ABB/Busch-Jaeger. Brand and trademark
rights remain with their owners. A different design does not itself guarantee
legal clearance. No permission to reuse the official logo was established;
this file should not be described as an official or legally cleared brand asset.

## Catalog activation is pending

The [Gladys cover rules](https://gladysassistant.com/docs/dev/external-integrations/#cover-image-rules)
require JPEG/PNG, exactly 800 × 534 pixels, under 150 KB, and a publicly reachable
direct **HTTPS URL** without redirects. The store indexer downloads, validates
and rehosts that image.

The repository is still private and no public hosting has been authorized.
Consequently, `cover_image` remains absent from the manifest rather than pointing
to a known-inaccessible private GitHub raw URL. The image is visible in the
repository README, but is **not yet activated on the installed Gladys catalog
card**. On an approved publication, host this file at a stable public HTTPS URL,
verify an anonymous fetch and its dimensions/size, then set `cover_image` to that
URL. Do not publish the repository or image merely to activate the cover.
