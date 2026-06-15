"""Public OSINT source registry for Pandora Nuclear Deterrence.

The registry intentionally contains only public, defensive, non-invasive sources:
RSS/Atom feeds, public alert feeds and official/public institutional pages that expose
machine-readable feeds. These sources are used to enrich Deterrence `liveSignals`;
Pandora Nuclear AI consumes the aggregated `liveSignals`, not a separate hidden feed.
"""

from __future__ import annotations

from collections import Counter


Source = dict[str, str]


NUCLEAR_OSINT_SOURCES: list[Source] = [
    # Global / international news and wire-style feeds
    {"name": "BBC World", "category": "global_news", "type": "rss", "url": "http://feeds.bbci.co.uk/news/world/rss.xml"},
    {"name": "BBC Europe", "category": "global_news", "type": "rss", "url": "http://feeds.bbci.co.uk/news/world/europe/rss.xml"},
    {"name": "BBC Asia", "category": "global_news", "type": "rss", "url": "http://feeds.bbci.co.uk/news/world/asia/rss.xml"},
    {"name": "BBC Middle East", "category": "global_news", "type": "rss", "url": "http://feeds.bbci.co.uk/news/world/middle_east/rss.xml"},
    {"name": "BBC US & Canada", "category": "global_news", "type": "rss", "url": "http://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml"},
    {"name": "Associated Press World", "category": "global_news", "type": "rss", "url": "https://apnews.com/hub/world-news?output=rss"},
    {"name": "Associated Press Politics", "category": "global_news", "type": "rss", "url": "https://apnews.com/hub/politics?output=rss"},
    {"name": "Associated Press National Security", "category": "global_news", "type": "rss", "url": "https://apnews.com/hub/national-security?output=rss"},
    {"name": "NPR World", "category": "global_news", "type": "rss", "url": "https://feeds.npr.org/1004/rss.xml"},
    {"name": "NPR National Security", "category": "global_news", "type": "rss", "url": "https://feeds.npr.org/1016/rss.xml"},
    {"name": "France 24 International", "category": "global_news", "type": "rss", "url": "https://www.france24.com/en/rss"},
    {"name": "France 24 France", "category": "global_news", "type": "rss", "url": "https://www.france24.com/en/france/rss"},
    {"name": "France 24 Europe", "category": "global_news", "type": "rss", "url": "https://www.france24.com/en/europe/rss"},
    {"name": "France 24 Middle East", "category": "global_news", "type": "rss", "url": "https://www.france24.com/en/middle-east/rss"},
    {"name": "France 24 Asia-Pacific", "category": "global_news", "type": "rss", "url": "https://www.france24.com/en/asia-pacific/rss"},
    {"name": "Deutsche Welle Top Stories", "category": "global_news", "type": "rss", "url": "https://rss.dw.com/rdf/rss-en-top"},
    {"name": "Deutsche Welle World", "category": "global_news", "type": "rss", "url": "https://rss.dw.com/xml/rss-en-world"},
    {"name": "Al Jazeera", "category": "global_news", "type": "rss", "url": "https://www.aljazeera.com/xml/rss/all.xml"},
    {"name": "RFI Monde", "category": "global_news", "type": "rss", "url": "https://www.rfi.fr/fr/rss"},
    {"name": "The Guardian World", "category": "global_news", "type": "rss", "url": "https://www.theguardian.com/world/rss"},
    {"name": "The Guardian International", "category": "global_news", "type": "rss", "url": "https://www.theguardian.com/international/rss"},
    {"name": "NYTimes World", "category": "global_news", "type": "rss", "url": "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"},
    {"name": "NYTimes US", "category": "global_news", "type": "rss", "url": "https://rss.nytimes.com/services/xml/rss/nyt/US.xml"},
    {"name": "Washington Post World", "category": "global_news", "type": "rss", "url": "https://feeds.washingtonpost.com/rss/world"},
    {"name": "Washington Post National Security", "category": "global_news", "type": "rss", "url": "https://feeds.washingtonpost.com/rss/national-security"},
    {"name": "Politico Europe", "category": "global_news", "type": "rss", "url": "https://www.politico.eu/feed/"},
    {"name": "EUobserver", "category": "global_news", "type": "rss", "url": "https://euobserver.com/rss.xml"},
    {"name": "Euronews World", "category": "global_news", "type": "rss", "url": "https://www.euronews.com/rss?level=theme&name=news"},
    {"name": "Euronews Europe", "category": "global_news", "type": "rss", "url": "https://www.euronews.com/rss?level=vertical&name=my-europe"},

    # Institutional diplomacy / international security
    {"name": "UN News", "category": "institutional_diplomacy", "type": "rss", "url": "https://news.un.org/feed/subscribe/en/news/all/rss.xml"},
    {"name": "UN Security Council Press", "category": "institutional_diplomacy", "type": "rss", "url": "https://press.un.org/en/content/security-council/feed"},
    {"name": "UN Meetings Coverage", "category": "institutional_diplomacy", "type": "rss", "url": "https://press.un.org/en/rss.xml"},
    {"name": "NATO News", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.nato.int/cps/en/natohq/rssFeed.htm"},
    {"name": "NATO Press Releases", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.nato.int/cps/en/natohq/press_releases.htm?selectedLocale=en&rss=true"},
    {"name": "EU Council Press", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.consilium.europa.eu/en/press/press-releases/?filters=1653&Page=1&format=RSS"},
    {"name": "European External Action Service", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.eeas.europa.eu/rss_en"},
    {"name": "European Commission News", "category": "institutional_diplomacy", "type": "rss", "url": "https://ec.europa.eu/commission/presscorner/api/rss?language=en"},
    {"name": "OSCE News", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.osce.org/feeds/news"},
    {"name": "ICRC News", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.icrc.org/en/rss.xml"},
    {"name": "US State Department", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.state.gov/rss-feed/press-releases/feed/"},
    {"name": "UK FCDO News", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom"},
    {"name": "France Diplomatie", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.diplomatie.gouv.fr/spip.php?page=backend-fd"},
    {"name": "German Foreign Office", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.auswaertiges-amt.de/en/newsroom/news?view=rss"},
    {"name": "Canada Global Affairs", "category": "institutional_diplomacy", "type": "rss", "url": "https://www.canada.ca/en/global-affairs/news.atom.xml"},

    # Nuclear institutions, safety, regulation, non-proliferation and civil nuclear
    {"name": "IAEA News", "category": "nuclear_institutional", "type": "rss", "url": "https://www.iaea.org/newscenter/rss.xml"},
    {"name": "IAEA Press Releases", "category": "nuclear_institutional", "type": "rss", "url": "https://www.iaea.org/newscenter/pressreleases/rss.xml"},
    {"name": "IAEA Nuclear Safety and Security", "category": "nuclear_safety", "type": "rss", "url": "https://www.iaea.org/topics/nuclear-safety-and-security/rss.xml"},
    {"name": "IAEA Safeguards", "category": "nuclear_institutional", "type": "rss", "url": "https://www.iaea.org/topics/safeguards/rss.xml"},
    {"name": "World Nuclear News", "category": "nuclear_industry", "type": "rss", "url": "https://www.world-nuclear-news.org/rss"},
    {"name": "World Nuclear Association", "category": "nuclear_industry", "type": "rss", "url": "https://world-nuclear.org/rss.aspx"},
    {"name": "Nuclear Energy Agency", "category": "nuclear_institutional", "type": "rss", "url": "https://www.oecd-nea.org/jcms/j_231/portail-application?portlet=navigation-portlet&text=&opSearch=true&jsp=plugins%2FMainPlugin%2Fjsp%2Frss.jsp"},
    {"name": "US NRC News", "category": "nuclear_regulator", "type": "rss", "url": "https://www.nrc.gov/reading-rm/doc-collections/news/index.xml"},
    {"name": "US NRC Event Notifications", "category": "nuclear_safety", "type": "rss", "url": "https://www.nrc.gov/reading-rm/doc-collections/event-status/event/index.xml"},
    {"name": "US Department of Energy", "category": "nuclear_energy", "type": "rss", "url": "https://www.energy.gov/rss.xml"},
    {"name": "DOE Office of Nuclear Energy", "category": "nuclear_energy", "type": "rss", "url": "https://www.energy.gov/ne/listings/rss.xml"},
    {"name": "National Nuclear Security Administration", "category": "nuclear_security", "type": "rss", "url": "https://www.energy.gov/nnsa/listings/rss.xml"},
    {"name": "UK Office for Nuclear Regulation", "category": "nuclear_regulator", "type": "rss", "url": "https://news.onr.org.uk/feed/"},
    {"name": "UK Nuclear Decommissioning Authority", "category": "nuclear_industry", "type": "rss", "url": "https://www.gov.uk/government/organisations/nuclear-decommissioning-authority.atom"},
    {"name": "France ASN", "category": "nuclear_regulator", "type": "rss", "url": "https://www.asn.fr/rss/actualites"},
    {"name": "France IRSN/ASNR", "category": "nuclear_safety", "type": "rss", "url": "https://www.irsn.fr/rss.xml"},
    {"name": "Canada CNSC", "category": "nuclear_regulator", "type": "rss", "url": "https://www.cnsc-ccsn.gc.ca/eng/rss/"},
    {"name": "ENSREG", "category": "nuclear_regulator", "type": "rss", "url": "https://www.ensreg.eu/rss.xml"},
    {"name": "WENRA", "category": "nuclear_regulator", "type": "rss", "url": "https://www.wenra.eu/rss.xml"},
    {"name": "ITER Newsline", "category": "fusion_research", "type": "rss", "url": "https://www.iter.org/rss/newsline"},
    {"name": "EUROfusion", "category": "fusion_research", "type": "rss", "url": "https://www.euro-fusion.org/feed/"},
    {"name": "Princeton Plasma Physics Laboratory", "category": "fusion_research", "type": "rss", "url": "https://www.pppl.gov/rss.xml"},
    {"name": "Nuclear Threat Initiative", "category": "nonproliferation", "type": "rss", "url": "https://www.nti.org/feed/"},
    {"name": "Arms Control Association", "category": "nonproliferation", "type": "rss", "url": "https://www.armscontrol.org/rss.xml"},
    {"name": "Federation of American Scientists", "category": "nonproliferation", "type": "rss", "url": "https://fas.org/feed/"},
    {"name": "Bulletin of the Atomic Scientists", "category": "nonproliferation", "type": "rss", "url": "https://thebulletin.org/feed/"},
    {"name": "SIPRI", "category": "defense_research", "type": "rss", "url": "https://www.sipri.org/rss.xml"},

    # Defense, strategic studies and regional security
    {"name": "IISS", "category": "defense_research", "type": "rss", "url": "https://www.iiss.org/rss"},
    {"name": "CSIS Analysis", "category": "defense_research", "type": "rss", "url": "https://www.csis.org/rss/analysis"},
    {"name": "CSIS Defense", "category": "defense_research", "type": "rss", "url": "https://www.csis.org/rss/programs/defense-and-security"},
    {"name": "RAND National Security", "category": "defense_research", "type": "rss", "url": "https://www.rand.org/topics/national-security.xml"},
    {"name": "RUSI", "category": "defense_research", "type": "rss", "url": "https://rusi.org/rss.xml"},
    {"name": "Chatham House", "category": "defense_research", "type": "rss", "url": "https://www.chathamhouse.org/rss.xml"},
    {"name": "Carnegie Endowment", "category": "defense_research", "type": "rss", "url": "https://carnegieendowment.org/rss/solr/?fa=feeds"},
    {"name": "Brookings Foreign Policy", "category": "defense_research", "type": "rss", "url": "https://www.brookings.edu/topic/foreign-policy/feed/"},
    {"name": "Atlantic Council", "category": "defense_research", "type": "rss", "url": "https://www.atlanticcouncil.org/feed/"},
    {"name": "War on the Rocks", "category": "defense_research", "type": "rss", "url": "https://warontherocks.com/feed/"},
    {"name": "Defense One", "category": "defense_news", "type": "rss", "url": "https://www.defenseone.com/rss/all/"},
    {"name": "Breaking Defense", "category": "defense_news", "type": "rss", "url": "https://breakingdefense.com/feed/"},
    {"name": "Defense News", "category": "defense_news", "type": "rss", "url": "https://www.defensenews.com/arc/outboundfeeds/rss/"},
    {"name": "US Department of Defense", "category": "defense_institutional", "type": "rss", "url": "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945"},
    {"name": "NATO Review", "category": "defense_institutional", "type": "rss", "url": "https://www.nato.int/docu/review/rss-en.xml"},
    {"name": "UK Ministry of Defence", "category": "defense_institutional", "type": "rss", "url": "https://www.gov.uk/government/organisations/ministry-of-defence.atom"},
    {"name": "French Armed Forces Ministry", "category": "defense_institutional", "type": "rss", "url": "https://www.defense.gouv.fr/rss.xml"},
    {"name": "European Defence Agency", "category": "defense_institutional", "type": "rss", "url": "https://eda.europa.eu/news-and-events/news/rss"},
    {"name": "Janes Latest News", "category": "defense_news", "type": "rss", "url": "https://www.janes.com/feeds/news"},

    # Crisis, humanitarian, disasters and natural hazards relevant to nuclear safety
    {"name": "ReliefWeb Updates", "category": "crisis_humanitarian", "type": "rss", "url": "https://reliefweb.int/updates/rss.xml"},
    {"name": "ReliefWeb Disasters", "category": "crisis_humanitarian", "type": "rss", "url": "https://reliefweb.int/disasters/rss.xml"},
    {"name": "GDACS Alerts", "category": "crisis_hazards", "type": "rss", "url": "https://www.gdacs.org/xml/rss.xml"},
    {"name": "USGS Significant Earthquakes", "category": "crisis_hazards", "type": "rss", "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.atom"},
    {"name": "USGS 4.5+ Earthquakes", "category": "crisis_hazards", "type": "rss", "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.atom"},
    {"name": "EMSC Earthquakes", "category": "crisis_hazards", "type": "rss", "url": "https://www.emsc-csem.org/service/rss/rss.php"},
    {"name": "NOAA Tsunami", "category": "crisis_hazards", "type": "rss", "url": "https://www.tsunami.gov/events/xml/PAAQAtom.xml"},
    {"name": "NASA Earth Observatory", "category": "crisis_hazards", "type": "rss", "url": "https://earthobservatory.nasa.gov/feeds/earth-observatory.rss"},
    {"name": "Copernicus EMS", "category": "crisis_hazards", "type": "rss", "url": "https://emergency.copernicus.eu/mapping/list-of-components/EMSR/feed"},
    {"name": "WHO Emergencies", "category": "crisis_humanitarian", "type": "rss", "url": "https://www.who.int/feeds/entity/csr/don/en/rss.xml"},

    # Cyber / critical infrastructure public alerts
    {"name": "CISA Alerts", "category": "cyber_critical_infra", "type": "rss", "url": "https://www.cisa.gov/news.xml"},
    {"name": "CISA Advisories", "category": "cyber_critical_infra", "type": "rss", "url": "https://www.cisa.gov/cybersecurity-advisories/all.xml"},
    {"name": "CISA ICS Advisories", "category": "cyber_critical_infra", "type": "rss", "url": "https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml"},
    {"name": "CISA KEV Catalog", "category": "cyber_critical_infra", "type": "rss", "url": "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"},
    {"name": "NVD Recent CVEs", "category": "cyber_critical_infra", "type": "rss", "url": "https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss-analyzed.xml"},
    {"name": "CERT-EU", "category": "cyber_critical_infra", "type": "rss", "url": "https://cert.europa.eu/publications/rss"},
    {"name": "ENISA News", "category": "cyber_critical_infra", "type": "rss", "url": "https://www.enisa.europa.eu/news/enisa-news/RSS"},
    {"name": "UK NCSC", "category": "cyber_critical_infra", "type": "rss", "url": "https://www.ncsc.gov.uk/api/1/services/v1/news-rss-feed.xml"},
    {"name": "ANSSI Actualités", "category": "cyber_critical_infra", "type": "rss", "url": "https://www.cert.ssi.gouv.fr/feed/"},
    {"name": "Microsoft Security Response Center", "category": "cyber_critical_infra", "type": "rss", "url": "https://msrc.microsoft.com/blog/feed"},

    # Sanctions / export control / legal pressure
    {"name": "OFAC Recent Actions", "category": "sanctions_export_control", "type": "rss", "url": "https://ofac.treasury.gov/recent-actions/rss.xml"},
    {"name": "US Treasury Press", "category": "sanctions_export_control", "type": "rss", "url": "https://home.treasury.gov/news/press-releases/rss"},
    {"name": "EU Sanctions Map Updates", "category": "sanctions_export_control", "type": "rss", "url": "https://www.sanctionsmap.eu/rss"},
    {"name": "UK Financial Sanctions", "category": "sanctions_export_control", "type": "rss", "url": "https://www.gov.uk/government/collections/financial-sanctions-regime-specific-consolidated-lists-and-releases.atom"},
    {"name": "UN Sanctions Press", "category": "sanctions_export_control", "type": "rss", "url": "https://press.un.org/en/content/sanctions/feed"},
    {"name": "BIS Export Administration", "category": "sanctions_export_control", "type": "rss", "url": "https://www.bis.doc.gov/index.php/newsroom/rss-feed"},
]


def source_categories() -> list[str]:
    return sorted({source["category"] for source in NUCLEAR_OSINT_SOURCES})


def source_registry_summary() -> dict:
    counts = Counter(source["category"] for source in NUCLEAR_OSINT_SOURCES)
    return {
        "registrySize": len(NUCLEAR_OSINT_SOURCES),
        "categories": sorted(counts),
        "categoryCounts": [{"name": name, "count": count} for name, count in sorted(counts.items())],
        "sourceNames": [source["name"] for source in NUCLEAR_OSINT_SOURCES],
    }