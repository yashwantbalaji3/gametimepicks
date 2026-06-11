/**
 * Root route renders the Today daily board. Under static export (output: "export") a server
 * redirect isn't available, so / *is* the Today command center — the single primary landing
 * experience (the old multi-concept homepage is retired). Re-exports the /today page so the two
 * routes stay identical; the brand mark + nav all lead here.
 */
export { default, metadata } from "./today/page";
