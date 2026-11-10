"""Canonical competition + club registry for GOALVISION AI.

One club = one stable id. Every provider name (openfootball, football-data.org, API-Football, StatsBomb)
is resolved to that id through `aliases`, so a logo can never be attached to the wrong club.
Club tuples: (id, display name, short name, TLA, home ground, extra aliases...)
"""
import re, unicodedata

LEAGUES = [
    # id, name, country, iso flag, openfootball key, football-data.org code, API-Football league id, zones
    dict(id='eng.1', name='Premier League', country='England', flag='gb-eng', of='en.1', fd='PL', af=39,
         zones=dict(ucl=4, uel=1, uecl=1, relegation=3)),
    dict(id='esp.1', name='La Liga', country='Spain', flag='es', of='es.1', fd='PD', af=140,
         zones=dict(ucl=4, uel=1, uecl=1, relegation=3)),
    dict(id='ita.1', name='Serie A', country='Italy', flag='it', of='it.1', fd='SA', af=135,
         zones=dict(ucl=4, uel=1, uecl=1, relegation=3)),
    dict(id='ger.1', name='Bundesliga', country='Germany', flag='de', of='de.1', fd='BL1', af=78,
         zones=dict(ucl=4, uel=1, uecl=1, relegation=2, playoff=1)),
    dict(id='fra.1', name='Ligue 1', country='France', flag='fr', of='fr.1', fd='FL1', af=61,
         zones=dict(ucl=3, uclq=1, uel=1, uecl=1, relegation=2, playoff=1)),
]

# Competitions the data layer knows about. `status` tells the UI what the bundled snapshot can show:
#   snapshot = shipped in data/, live = needs the backend (never invented), planned = schema-ready only.
COMPETITIONS = [
    dict(id='ucl', name='UEFA Champions League', kind='club-international', fd='CL', af=2, status='snapshot'),
    dict(id='uel', name='UEFA Europa League', kind='club-international', fd=None, af=3, status='live'),
    dict(id='uecl', name='UEFA Conference League', kind='club-international', fd=None, af=848, status='live'),
    dict(id='cwc', name='FIFA Club World Cup', kind='club-international', fd=None, af=15, status='live'),
    dict(id='usc', name='UEFA Super Cup', kind='club-international', fd=None, af=531, status='live'),
    dict(id='wc', name='FIFA World Cup', kind='national', fd='WC', af=1, status='snapshot'),
    dict(id='wcq', name='World Cup qualifying', kind='national', fd=None, af=32, status='live'),
    dict(id='euro', name='UEFA European Championship', kind='national', fd='EC', af=4, status='snapshot'),
    dict(id='copa', name='Copa América', kind='national', fd=None, af=9, status='snapshot'),
    dict(id='usa.1', name='MLS', kind='league', fd=None, af=253, status='planned'),
    dict(id='por.1', name='Liga Portugal', kind='league', fd='PPL', af=94, status='planned'),
    dict(id='ned.1', name='Eredivisie', kind='league', fd='DED', af=88, status='planned'),
    dict(id='bra.1', name='Brasileirão Série A', kind='league', fd='BSA', af=71, status='planned'),
    dict(id='arg.1', name='Primera División', kind='league', fd=None, af=128, status='planned'),
    dict(id='mex.1', name='Liga MX', kind='league', fd=None, af=262, status='planned'),
    dict(id='ksa.1', name='Saudi Pro League', kind='league', fd=None, af=307, status='planned'),
]

CLUBS = {
 'eng.1': [
  ('bournemouth', 'AFC Bournemouth', 'Bournemouth', 'BOU', 'Vitality Stadium'),
  ('arsenal', 'Arsenal', 'Arsenal', 'ARS', 'Emirates Stadium'),
  ('aston-villa', 'Aston Villa', 'Aston Villa', 'AVL', 'Villa Park'),
  ('brentford', 'Brentford', 'Brentford', 'BRE', 'Gtech Community Stadium'),
  ('brighton', 'Brighton & Hove Albion', 'Brighton', 'BHA', 'Amex Stadium', 'Brighton Hove Albion'),
  ('chelsea', 'Chelsea', 'Chelsea', 'CHE', 'Stamford Bridge'),
  ('coventry', 'Coventry City', 'Coventry', 'COV', 'Coventry Building Society Arena'),
  ('crystal-palace', 'Crystal Palace', 'Crystal Palace', 'CRY', 'Selhurst Park'),
  ('everton', 'Everton', 'Everton', 'EVE', 'Hill Dickinson Stadium'),
  ('fulham', 'Fulham', 'Fulham', 'FUL', 'Craven Cottage'),
  ('hull', 'Hull City', 'Hull City', 'HUL', 'MKM Stadium', 'Hull City AFC'),
  ('ipswich', 'Ipswich Town', 'Ipswich', 'IPS', 'Portman Road'),
  ('leeds', 'Leeds United', 'Leeds', 'LEE', 'Elland Road'),
  ('liverpool', 'Liverpool', 'Liverpool', 'LIV', 'Anfield'),
  ('man-city', 'Manchester City', 'Man City', 'MCI', 'Etihad Stadium'),
  ('man-united', 'Manchester United', 'Man United', 'MUN', 'Old Trafford', 'Manchester Utd'),
  ('newcastle', 'Newcastle United', 'Newcastle', 'NEW', "St James' Park"),
  ('nottingham-forest', 'Nottingham Forest', "Nott'm Forest", 'NFO', 'City Ground'),
  ('sunderland', 'Sunderland', 'Sunderland', 'SUN', 'Stadium of Light', 'Sunderland AFC'),
  ('tottenham', 'Tottenham Hotspur', 'Tottenham', 'TOT', 'Tottenham Hotspur Stadium', 'Tottenham'),
 ],
 'esp.1': [
  ('athletic', 'Athletic Club', 'Athletic', 'ATH', 'San Mamés', 'Athletic Bilbao'),
  ('atletico', 'Atlético Madrid', 'Atlético', 'ATM', 'Metropolitano', 'Club Atlético de Madrid', 'Atletico de Madrid'),
  ('osasuna', 'CA Osasuna', 'Osasuna', 'OSA', 'El Sadar', 'Osasuna'),
  ('celta', 'Celta Vigo', 'Celta', 'CEL', 'Balaídos', 'RC Celta', 'RC Celta de Vigo'),
  ('alaves', 'Deportivo Alavés', 'Alavés', 'ALA', 'Mendizorroza', 'CD Alavés', 'Alaves'),
  ('elche', 'Elche CF', 'Elche', 'ELC', 'Martínez Valero', 'Elche'),
  ('barcelona', 'FC Barcelona', 'Barcelona', 'BAR', 'Spotify Camp Nou', 'Barcelona'),
  ('getafe', 'Getafe CF', 'Getafe', 'GET', 'Coliseum', 'Getafe'),
  ('levante', 'Levante UD', 'Levante', 'LEV', 'Ciutat de València', 'Levante'),
  ('malaga', 'Málaga CF', 'Málaga', 'MLG', 'La Rosaleda', 'Malaga'),
  ('racing', 'Racing Santander', 'Racing', 'RAC', 'El Sardinero', 'Real Racing Club de Santander', 'Racing de Santander'),
  ('rayo', 'Rayo Vallecano', 'Rayo', 'RAY', 'Estadio de Vallecas', 'Rayo Vallecano de Madrid'),
  ('deportivo', 'Deportivo La Coruña', 'Deportivo', 'DEP', 'Riazor', 'RC Deportivo La Coruña', 'Deportivo de La Coruña'),
  ('espanyol', 'RCD Espanyol', 'Espanyol', 'ESP', 'RCDE Stadium', 'Espanyol Barcelona', 'RCD Espanyol de Barcelona', 'Espanyol'),
  ('betis', 'Real Betis', 'Betis', 'BET', 'La Cartuja (Benito Villamarín under rebuild)', 'Real Betis Balompié'),
  ('real-madrid', 'Real Madrid', 'Real Madrid', 'RMA', 'Santiago Bernabéu', 'Real Madrid CF'),
  ('real-sociedad', 'Real Sociedad', 'Real Sociedad', 'RSO', 'Reale Arena', 'Real Sociedad de Fútbol'),
  ('sevilla', 'Sevilla FC', 'Sevilla', 'SEV', 'Ramón Sánchez-Pizjuán', 'Sevilla'),
  ('valencia', 'Valencia CF', 'Valencia', 'VAL', 'Mestalla', 'Valencia'),
  ('villarreal', 'Villarreal CF', 'Villarreal', 'VIL', 'Estadio de la Cerámica', 'Villarreal'),
 ],
 'ita.1': [
  ('milan', 'AC Milan', 'Milan', 'MIL', 'San Siro', 'Milan'),
  ('monza', 'AC Monza', 'Monza', 'MON', 'U-Power Stadium', 'Monza'),
  ('roma', 'AS Roma', 'Roma', 'ROM', 'Stadio Olimpico', 'Roma'),
  ('atalanta', 'Atalanta', 'Atalanta', 'ATA', 'New Balance Arena', 'Atalanta BC'),
  ('bologna', 'Bologna', 'Bologna', 'BOL', "Renato Dall'Ara", 'Bologna FC', 'Bologna FC 1909'),
  ('cagliari', 'Cagliari', 'Cagliari', 'CAG', 'Unipol Domus', 'Cagliari Calcio'),
  ('como', 'Como 1907', 'Como', 'COM', 'Stadio Giuseppe Sinigaglia', 'Como'),
  ('fiorentina', 'Fiorentina', 'Fiorentina', 'FIO', 'Artemio Franchi', 'ACF Fiorentina'),
  ('frosinone', 'Frosinone', 'Frosinone', 'FRO', 'Benito Stirpe', 'Frosinone Calcio'),
  ('genoa', 'Genoa', 'Genoa', 'GEN', 'Luigi Ferraris', 'Genoa CFC'),
  ('inter', 'Inter', 'Inter', 'INT', 'San Siro', 'FC Internazionale Milano', 'Internazionale', 'Inter Milan'),
  ('juventus', 'Juventus', 'Juventus', 'JUV', 'Allianz Stadium', 'Juventus FC'),
  ('lazio', 'Lazio', 'Lazio', 'LAZ', 'Stadio Olimpico', 'SS Lazio', 'Lazio Roma'),
  ('lecce', 'Lecce', 'Lecce', 'LEC', 'Via del Mare', 'US Lecce'),
  ('napoli', 'Napoli', 'Napoli', 'NAP', 'Stadio Diego Armando Maradona', 'SSC Napoli'),
  ('parma', 'Parma', 'Parma', 'PAR', 'Ennio Tardini', 'Parma Calcio 1913', 'Parma FC'),
  ('sassuolo', 'Sassuolo', 'Sassuolo', 'SAS', 'Mapei Stadium', 'US Sassuolo Calcio', 'Sassuolo Calcio'),
  ('torino', 'Torino', 'Torino', 'TOR', 'Olimpico Grande Torino', 'Torino FC'),
  ('udinese', 'Udinese', 'Udinese', 'UDI', 'Bluenergy Stadium', 'Udinese Calcio'),
  ('venezia', 'Venezia', 'Venezia', 'VEN', 'Pier Luigi Penzo', 'Venezia FC'),
 ],
 'ger.1': [
  ('bayern', 'Bayern München', 'Bayern', 'FCB', 'Allianz Arena', 'FC Bayern München', 'Bayern Munich', 'FC Bayern Munchen'),
  ('dortmund', 'Borussia Dortmund', 'Dortmund', 'BVB', 'Signal Iduna Park'),
  ('leipzig', 'RB Leipzig', 'Leipzig', 'RBL', 'Red Bull Arena'),
  ('stuttgart', 'VfB Stuttgart', 'Stuttgart', 'VFB', 'MHPArena'),
  ('hoffenheim', 'TSG Hoffenheim', 'Hoffenheim', 'TSG', 'PreZero Arena', 'TSG 1899 Hoffenheim', '1899 Hoffenheim'),
  ('leverkusen', 'Bayer Leverkusen', 'Leverkusen', 'B04', 'BayArena', 'Bayer 04 Leverkusen'),
  ('freiburg', 'SC Freiburg', 'Freiburg', 'SCF', 'Europa-Park Stadion'),
  ('frankfurt', 'Eintracht Frankfurt', 'Frankfurt', 'SGE', 'Deutsche Bank Park'),
  ('augsburg', 'FC Augsburg', 'Augsburg', 'FCA', 'WWK Arena'),
  ('mainz', 'Mainz 05', 'Mainz', 'M05', 'Mewa Arena', '1. FSV Mainz 05', 'FSV Mainz 05'),
  ('union-berlin', 'Union Berlin', 'Union Berlin', 'FCU', 'An der Alten Försterei', '1. FC Union Berlin'),
  ('gladbach', 'Borussia Mönchengladbach', "M'gladbach", 'BMG', 'Borussia-Park', 'Bor. Mönchengladbach', 'Borussia Monchengladbach'),
  ('hamburg', 'Hamburger SV', 'Hamburg', 'HSV', 'Volksparkstadion'),
  ('koln', '1. FC Köln', 'Köln', 'KOE', 'RheinEnergieStadion', 'FC Köln', 'FC Koln', '1. FC Koln'),
  ('bremen', 'Werder Bremen', 'Bremen', 'SVW', 'Weserstadion', 'SV Werder Bremen'),
  ('schalke', 'Schalke 04', 'Schalke', 'S04', 'Veltins-Arena', 'FC Schalke 04'),
  ('elversberg', 'SV Elversberg', 'Elversberg', 'SVE', 'Ursapharm-Arena an der Kaiserlinde', 'SV 07 Elversberg'),
  ('paderborn', 'SC Paderborn 07', 'Paderborn', 'SCP', 'Home Deluxe Arena', 'SC Paderborn'),
 ],
 'fra.1': [
  ('auxerre', 'AJ Auxerre', 'Auxerre', 'AJA', 'Stade de l\'Abbé-Deschamps'),
  ('angers', 'Angers SCO', 'Angers', 'SCO', 'Stade Raymond-Kopa'),
  ('monaco', 'AS Monaco', 'Monaco', 'ASM', 'Stade Louis-II', 'AS Monaco FC'),
  ('lorient', 'FC Lorient', 'Lorient', 'FCL', 'Stade du Moustoir'),
  ('le-havre', 'Le Havre AC', 'Le Havre', 'HAC', 'Stade Océane'),
  ('le-mans', 'Le Mans FC', 'Le Mans', 'LMF', 'Stade Marie-Marvingt'),
  ('lille', 'Lille OSC', 'Lille', 'LIL', 'Stade Pierre-Mauroy', 'LOSC Lille'),
  ('nice', 'OGC Nice', 'Nice', 'NCE', 'Allianz Riviera'),
  ('marseille', 'Olympique de Marseille', 'Marseille', 'OM', 'Orange Vélodrome', 'Olympique Marseille'),
  ('lyon', 'Olympique Lyonnais', 'Lyon', 'OL', 'Groupama Stadium'),
  ('paris-fc', 'Paris FC', 'Paris FC', 'PFC', 'Stade Jean-Bouin'),
  ('psg', 'Paris Saint-Germain', 'PSG', 'PSG', 'Parc des Princes', 'Paris Saint-Germain FC'),
  ('lens', 'RC Lens', 'Lens', 'RCL', 'Stade Bollaert-Delelis', 'Racing Club de Lens'),
  ('strasbourg', 'RC Strasbourg', 'Strasbourg', 'RCS', 'Stade de la Meinau', 'RC Strasbourg Alsace'),
  ('brest', 'Stade Brestois 29', 'Brest', 'SB29', 'Stade Francis-Le Blé', 'Stade Brestois'),
  ('rennes', 'Stade Rennais', 'Rennes', 'SRF', 'Roazhon Park', 'Stade Rennais FC 1901', 'Stade Rennais FC'),
  ('toulouse', 'Toulouse FC', 'Toulouse', 'TFC', 'Stadium de Toulouse'),
  ('troyes', 'ESTAC Troyes', 'Troyes', 'EST', 'Stade de l\'Aube', 'ES Troyes AC'),
 ],
}

# Former top-flight clubs that appear under more than one spelling in the archive.
PAST_ALIASES = {
    'st-pauli': ('FC St. Pauli', ['FC St. Pauli 1910']),
    'greuther-furth': ('Greuther Fürth', ['SpVgg Greuther Fürth', 'SpVgg Greuther Fürth 1903']),
    'verona': ('Hellas Verona', ['Hellas Verona FC']),
    'sampdoria': ('Sampdoria', ['UC Sampdoria']),
    'valladolid': ('Real Valladolid', ['Real Valladolid CF']),
    'heidenheim': ('1. FC Heidenheim', ['1. FC Heidenheim 1846']),
    'bochum': ('VfL Bochum', ['VfL Bochum 1848']),
    'pisa': ('Pisa', ['AC Pisa 1909']),
    'salernitana': ('Salernitana', ['US Salernitana 1919']),
    'spal': ('SPAL', ['SPAL 2013 Ferrara']),
    'wolves': ('Wolverhampton Wanderers', ['Wolverhampton Wanderers FC']),
    'west-ham': ('West Ham United', ['West Ham United FC']),
    'west-brom': ('West Bromwich Albion', ['West Bromwich Albion FC']),
    'leicester': ('Leicester City', ['Leicester City FC']),
    'norwich': ('Norwich City', ['Norwich City FC']),
    'sheffield-united': ('Sheffield United', ['Sheffield United FC']),
    'bordeaux': ('Girondins de Bordeaux', ['Girondins Bordeaux']),
    'saint-etienne': ('AS Saint-Étienne', []),
}

def fold(s):
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c)).casefold()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def slug(s):
    return fold(s).replace(' ', '-')

SUFFIX = re.compile(r'\s+(fc|afc|cf|cfc|bc|sc)$')
def tidy(name):
    """Readable name for a historical club that has no curated entry."""
    return re.sub(r'\s+(FC|AFC|CF)$', '', name).strip()

class Resolver:
    def __init__(self):
        self.by_alias, self.clubs, self.past = {}, {}, {}
        for lg, rows in CLUBS.items():
            for row in rows:
                cid, name, short, tla, ground, *aliases = row
                self.clubs[cid] = dict(id=cid, league=lg, name=name, short=short, tla=tla, ground=ground,
                                       aliases=sorted({name, short, *aliases}))
                for a in {name, short, *aliases, name + ' FC', short + ' FC'}:
                    self.by_alias.setdefault(fold(a), cid)
                self.by_alias.setdefault(SUFFIX.sub('', fold(name)), cid)
        for pid, (name, aliases) in PAST_ALIASES.items():
            self.past[pid] = name
            for a in [name, *aliases]: self.by_alias.setdefault(fold(a), pid)

    def resolve(self, raw, league=None):
        raw = re.sub(r'\s*\([A-Z]{3}\)\s*$', '', raw).strip()      # "Arsenal FC (ENG)" -> "Arsenal FC"
        key = fold(raw)
        for k in (key, SUFFIX.sub('', key)):
            if k in self.by_alias: return self.by_alias[k]
        pid = slug(tidy(raw))
        self.past.setdefault(pid, tidy(raw))
        self.by_alias[key] = pid
        return pid

# ISO codes for flagcdn.com (public-domain flag artwork). Historical states without a modern flag map to None.
FLAGS = {
 'Algeria':'dz','Angola':'ao','Argentina':'ar','Australia':'au','Austria':'at','Belgium':'be','Bolivia':'bo','Bosnia-Herzegovina':'ba',
 'Bosnia and Herzegovina':'ba','Bosnia & Herzegovina':'ba','Brazil':'br','Bulgaria':'bg','Cameroon':'cm','Canada':'ca','Cape Verde':'cv','Chile':'cl','China':'cn','China PR':'cn',
 'Colombia':'co','Costa Rica':'cr','Croatia':'hr','Cuba':'cu','Curaçao':'cw','Czech Republic':'cz','Czechia':'cz','Denmark':'dk','DR Congo':'cd',
 'Ecuador':'ec','Egypt':'eg','El Salvador':'sv','England':'gb-eng','France':'fr','Georgia':'ge','Germany':'de','Ghana':'gh','Greece':'gr','Haiti':'ht',
 'Honduras':'hn','Hungary':'hu','Iceland':'is','Iran':'ir','Iraq':'iq','Ireland':'ie','Republic of Ireland':'ie','Israel':'il','Italy':'it',
 'Ivory Coast':'ci',"Côte d'Ivoire":'ci','Jamaica':'jm','Japan':'jp','Jordan':'jo','Kuwait':'kw','Mexico':'mx','Morocco':'ma','Netherlands':'nl',
 'New Zealand':'nz','Nigeria':'ng','North Korea':'kp','Northern Ireland':'gb-nir','Norway':'no','Panama':'pa','Paraguay':'py','Peru':'pe','Poland':'pl',
 'Portugal':'pt','Qatar':'qa','Romania':'ro','Russia':'ru','Saudi Arabia':'sa','Scotland':'gb-sct','Senegal':'sn','Serbia':'rs','Slovakia':'sk',
 'Slovenia':'si','South Africa':'za','South Korea':'kr','Korea Republic':'kr','Spain':'es','Sweden':'se','Switzerland':'ch','Togo':'tg',
 'Trinidad and Tobago':'tt','Tunisia':'tn','Turkey':'tr','Türkiye':'tr','Ukraine':'ua','United Arab Emirates':'ae','United States':'us','USA':'us',
 'Uruguay':'uy','Uzbekistan':'uz','Venezuela':'ve','Wales':'gb-wls','Albania':'al','Zaire':'cd','West Germany':'de','Dutch East Indies':'id',
 'Indonesia':'id','Serbia and Montenegro':'rs','Soviet Union':None,'Yugoslavia':None,'Czechoslovakia':None,'East Germany':None,
}
