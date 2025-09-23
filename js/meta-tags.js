/**
 * Dynamic Meta Tags System for Social Sharing
 * Reads meta tag data from HTML data attributes and generates Open Graph and Twitter Card tags
 */

(function() {
    'use strict';

    // Default meta tag values
    const defaults = {
        siteName: 'Baology Prep',
        siteUrl: 'https://baology.org',
        defaultImage: 'https://baology.org/images/favicon.png',
        defaultType: 'article'
    };

    /**
     * Add a meta tag to the document head
     */
    function addMetaTag(property, content, attribute = 'property') {
        // Remove existing tag if it exists
        const existing = document.querySelector(`meta[${attribute}="${property}"]`);
        if (existing) {
            existing.remove();
        }

        // Create new meta tag
        const meta = document.createElement('meta');
        meta.setAttribute(attribute, property);
        meta.setAttribute('content', content);
        document.head.appendChild(meta);
    }

    /**
     * Get meta tag data from the page
     */
    function getMetaData() {
        const metaContainer = document.querySelector('[data-meta-tags]');
        if (!metaContainer) return null;

        return {
            title: metaContainer.dataset.metaTitle || document.title,
            description: metaContainer.dataset.metaDescription || '',
            image: metaContainer.dataset.metaImage || defaults.defaultImage,
            type: metaContainer.dataset.metaType || defaults.defaultType,
            url: metaContainer.dataset.metaUrl || window.location.href
        };
    }

    /**
     * Generate all social sharing meta tags
     */
    function generateMetaTags() {
        const meta = getMetaData();
        if (!meta) return;

        // Update page title if provided
        if (meta.title && meta.title !== document.title) {
            document.title = meta.title;
        }

        // Open Graph tags
        addMetaTag('og:title', meta.title);
        addMetaTag('og:description', meta.description);
        addMetaTag('og:image', meta.image);
        addMetaTag('og:url', meta.url);
        addMetaTag('og:type', meta.type);
        addMetaTag('og:site_name', defaults.siteName);

        // Twitter Card tags
        addMetaTag('twitter:card', 'summary_large_image', 'name');
        addMetaTag('twitter:title', meta.title, 'name');
        addMetaTag('twitter:description', meta.description, 'name');
        addMetaTag('twitter:image', meta.image, 'name');

        // Additional meta tags
        addMetaTag('description', meta.description, 'name');
    }

    /**
     * Initialize meta tags when DOM is ready
     */
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', generateMetaTags);
        } else {
            generateMetaTags();
        }
    }

    // Start the system
    init();

})();
