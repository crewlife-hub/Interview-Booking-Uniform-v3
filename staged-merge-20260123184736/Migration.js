/**
 * Migration.gs
 * One-time migration scripts to populate config data.
 * Run these manually from Apps Script editor, then delete or disable.
 */

/**
 * Populate CL_CODES sheet with legacy CODE_TO_URL mappings.
 * Run once to migrate from hardcoded Config.js to sheet-based lookup.
 */
function migrateLegacyCLCodesToSheet() {
  // Legacy CODE_TO_URL from Royal-live-Bookings Config.js
  var LEGACY_CODE_TO_URL = {
    'CL100': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2K0cg4dK7C76asioo7QSvq2tcE1GahLyY9qi1CjNzT0jM562eRqE59dVdaQMNVoMlHAluBuYPc',
    'CL150': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2wLuqAJe8lXR5L23TZTJn0x6pQncCRH2wM7455JImOCUW5LUCEPj83mwQjkodHXTyunzpPC89f',
    'CL200': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0i6hUk-9qI__aPa2f1MNCr20MpxDCkN_-c7WwTq6sFtI5mJenIjMloL19QkbPbwAgPzO57CZLN',
    'CL300': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ3kY8eRb_-N9cqQPsRItH2sosv1JGmcqhMFyuV2sFzujmkwLv9GV7RF1tYKdLm4dqbQO6J86_Mo',
    'CL400': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2-tHwCAeq-msro2UvwRDYhh4LMmzPH50BEy1xb_AalQ-uZ5mlFt4OWoExOoOm0j3uo5cfIDyVs',
    'CL500': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0AKPH-Qg79y-a6CAeKc5x4idez4jTn-88nAo0iGLWEXmROD-OKeSniX6wY3p757VBqT2z_eAKj',
    'CL600': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ0YYoqlWElPIJfUWhQYu4C3YLQ_VAuzCYRxSA0omGPFKzLErfISba7Xe2OBAT9tnZ-YzH1_vPqz',
    'CL700': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2xLieHqK8oQ-Tpk4InNzU0o0cJOQfbE1EqlH_tR67VcySXOPAQNkXddbylI95SRLE-LDTx8HPX',
    'CL800': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2MAuU81pFbw3Ik7GSeDL0yOc3opUdLrnUnKHnDv7YOENQurkTOMxxTlzX7VW4_a5jcaV1cmMSu',
    'CL850': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ1lbcVW_9AgSbTnJ0_IF7ni8VTG2A12oxKjyB1YxhbzcWpUhQEfmsiKr20Bo_QbpervtZngBJ3W',
    'CL900': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2Sq041JZta4xyPq9S-UeB8_7r18_CW-t9Wrmi0_lEja9ZIcR9cybtm-ySTZpbEmSn-OV6t_E_d',
    'CL1000': 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ1bhOzqt40KXmAafG6LI7hNE5whsyL2ZzfRn4Z0Y2fNHVE5Vr7Uofef073wCOQM9SSSeY_3X08M'
  };

  // Recruiter mapping (fill in actual names/emails as needed)
  var RECRUITER_INFO = {
    'CL100': { name: 'Recruiter 1', email: 'recruiter1@crewlifeatsea.com' },
    'CL150': { name: 'Recruiter 2', email: 'recruiter2@crewlifeatsea.com' },
    'CL200': { name: 'Recruiter 3', email: 'recruiter3@crewlifeatsea.com' },
    'CL300': { name: 'Recruiter 4', email: 'recruiter4@crewlifeatsea.com' },
    'CL400': { name: 'Recruiter 5', email: 'recruiter5@crewlifeatsea.com' },
    'CL500': { name: 'Recruiter 6', email: 'recruiter6@crewlifeatsea.com' },
    'CL600': { name: 'Recruiter 7', email: 'recruiter7@crewlifeatsea.com' },
    'CL700': { name: 'Recruiter 8', email: 'recruiter8@crewlifeatsea.com' },
    'CL800': { name: 'Recruiter 9', email: 'recruiter9@crewlifeatsea.com' },
    'CL850': { name: 'Recruiter 10', email: 'recruiter10@crewlifeatsea.com' },
    'CL900': { name: 'Recruiter 11', email: 'recruiter11@crewlifeatsea.com' },
    'CL1000': { name: 'Recruiter 12', email: 'recruiter12@crewlifeatsea.com' }
  };

  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('CL_CODES');
  
  if (!sheet) {
    // Create sheet with headers
    sheet = ss.insertSheet('CL_CODES');
    sheet.appendRow(['Brand', 'CL Code', 'Recruiter Name', 'Recruiter Email', 'Booking Schedule URL', 'Active', 'Last Updated']);
    sheet.setFrozenRows(1);
    Logger.log('Created CL_CODES sheet');
  }
  
  // Check existing data
  var existingData = sheet.getDataRange().getValues();
  var existingCodes = {};
  for (var i = 1; i < existingData.length; i++) {
    var brand = String(existingData[i][0]).toUpperCase();
    var code = String(existingData[i][1]).toUpperCase();
    existingCodes[brand + '_' + code] = true;
  }
  
  var added = 0;
  var skipped = 0;
  var now = new Date().toISOString();
  
  for (var clCode in LEGACY_CODE_TO_URL) {
    var key = 'ROYAL_' + clCode;
    if (existingCodes[key]) {
      Logger.log('Skipping existing: ROYAL / %s', clCode);
      skipped++;
      continue;
    }
    
    var url = LEGACY_CODE_TO_URL[clCode];
    var info = RECRUITER_INFO[clCode] || { name: '', email: '' };
    
    sheet.appendRow([
      'ROYAL',           // Brand
      clCode,            // CL Code
      info.name,         // Recruiter Name
      info.email,        // Recruiter Email
      url,               // Booking Schedule URL
      true,              // Active
      now                // Last Updated
    ]);
    
    Logger.log('Added: ROYAL / %s', clCode);
    added++;
  }
  
  Logger.log('Migration complete. Added: %s, Skipped: %s', added, skipped);
  return { added: added, skipped: skipped };
}


/**
 * Set required script properties for Smartsheet integration.
 * Run once after deployment.
 */
function setSmartsheetProperties() {
  var props = PropertiesService.getScriptProperties();
  
  // Legacy values from Royal-live-Bookings Config.js
  props.setProperty('SMARTSHEET_ID_ROYAL', '118517627047812');
  props.setProperty('SMARTSHEET_API_TOKEN', 'hVMM8MoLdCbTxnvtfqcmtMfSD1wK1suRqOJSn');
  
  // Column IDs from legacy (optional - can be detected from column titles)
  props.setProperty('COL_EMAIL_ID_ROYAL', '8026953069842308');
  props.setProperty('COL_TEXT_FOR_EMAIL_ID_ROYAL', '1126793421213572');
  
  Logger.log('Script properties set for Smartsheet integration');
  Logger.log('SMARTSHEET_ID_ROYAL: %s', props.getProperty('SMARTSHEET_ID_ROYAL'));
}


/**
 * Verify CL_CODES sheet has expected data.
 * Returns summary of configured CL codes per brand.
 */
function verifyCLCodesSheet() {
  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('CL_CODES');
  
  if (!sheet) {
    Logger.log('CL_CODES sheet does not exist!');
    return { ok: false, error: 'Sheet not found' };
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('CL_CODES sheet is empty (no data rows)');
    return { ok: false, error: 'No data rows', rowCount: 0 };
  }
  
  var headers = data[0];
  var brandIdx = headers.indexOf('Brand');
  var codeIdx = headers.indexOf('CL Code');
  var urlIdx = headers.indexOf('Booking Schedule URL');
  var activeIdx = headers.indexOf('Active');
  
  var summary = {};
  var issues = [];
  
  for (var i = 1; i < data.length; i++) {
    var brand = String(data[i][brandIdx]).toUpperCase();
    var code = String(data[i][codeIdx]).toUpperCase();
    var url = String(data[i][urlIdx] || '').trim();
    var active = data[i][activeIdx];
    
    if (!summary[brand]) summary[brand] = { total: 0, active: 0, noUrl: 0 };
    summary[brand].total++;
    
    if (active === true || active === 'TRUE' || active === 'true') {
      summary[brand].active++;
    }
    
    if (!url || url.indexOf('http') !== 0) {
      summary[brand].noUrl++;
      issues.push('Row ' + (i + 1) + ': ' + brand + '/' + code + ' has invalid URL');
    }
  }
  
  Logger.log('CL_CODES Summary: %s', JSON.stringify(summary));
  if (issues.length > 0) {
    Logger.log('Issues found:\n%s', issues.join('\n'));
  }
  
  return { ok: issues.length === 0, summary: summary, issues: issues, rowCount: data.length - 1 };
}


/**
 * Test CL code resolution for a specific brand/textForEmail.
 * Use this to debug "Could not resolve CL code" errors.
 */
function testCLCodeResolution(brand, textForEmail) {
  brand = brand || 'ROYAL';
  textForEmail = textForEmail || 'Shop Attendant - CL200';
  
  Logger.log('Testing CL resolution for: brand=%s, textForEmail=%s', brand, textForEmail);
  
  var result = resolveCLCodeFromTextForEmail_(brand, textForEmail);
  Logger.log('Result: %s', JSON.stringify(result, null, 2));
  
  return result;
}

/**
 * Populate JOBS sheet with available position titles
 * Maps job titles to their default CL codes
 */
function migrateJobTitlesToSheet() {
  // Master list of all job titles from user
  var JOB_TITLES = [
    '1ST ELECTRICAL ENGINEER',
    '1ST ENGINEER',
    '1ST OFFICER - CELEBRITY',
    '2ND BUTCHER',
    '2ND ELECTRICAL ENGINEER',
    '2ND ENGINEER CELEBRITY',
    '2ND OFFICER - CELEBRITY',
    '3RD COOK PANTRY',
    '3RD COOK SUSHI',
    '3RD ELECTRICAL ENGINEER',
    '3RD ENGINEER 2ND TICKET',
    '3RD ENGINEER CELEBRITY',
    '3RD OFFICER',
    'A/C ENGINEER',
    'ACCOMMODATIONS MAINTENANCE MGR',
    'ACCOMODATIONS MAINTENANCE SUP.',
    'ACTIVITIES HOST',
    'ACTIVITY MANAGER',
    'ACUPUNCTURE PHYSICIAN',
    'ACUPUNCTURE THERAPIST',
    'ACUPUNCTURIST',
    'ADMINISTRATION PURSER - DOCUME',
    'ADMINISTRATION PURSER - PAYROL',
    'ADULT ANIMATOR',
    'AERIAL FLYERS/ADAGIO',
    'AESTHETICS PHYSICIAN',
    'AGENCY DOCTOR',
    'AGENCY INFECTION CONTROL OFF',
    'AGENCY NURSE',
    'AMOS CONTROLLER',
    'APPR.OFFICER/DECK CADET',
    'APPRENTICE ENGINEER/ENGINE CAD',
    'ART ASSOCIATE',
    'ART AUCTIONEER',
    'ART AUCTIONEER (BA AUC)',
    'ART CONTRACTOR',
    'ART STEWARD',
    'ARTIST OBE',
    'ASSISTANT ART AUCTIONEER',
    'ASSISTANT BAR MANAGER',
    'ASSISTANT CASINO MANAGER',
    'ASSISTANT CULINARY TOUR GUIDE',
    'ASSISTANT ELECTRICIAN 1',
    'ASSISTANT ELECTRICIAN 2',
    'ASSISTANT ELECTRICIAN 3',
    'ASSISTANT MAITRE D\'',
    'ASSISTANT PASTRY CHEF',
    'ASSISTANT SPA MANAGER',
    'ASSOC. ART STEWARD',
    'ASSOCIATE F&B DIRECTOR',
    'ASSOCIATE HOTEL DIRECTOR',
    'ASST ART AUCTIONEER (BA AUC)',
    'ASST CASINO HOST',
    'ASST FOOD STOREKEEPER',
    'ASST FRONT DESK MANAGER',
    'ASST GALLEY OPERATIONS MGR',
    'ASST MGR ONB DEST & SHIP EXP',
    'ASST SANITATION ENGINEER',
    'ASST SPA DIRECTOR',
    'ASST WAITER',
    'ASST WAITER LUMINAE',
    'ASST. CRUISE SALES MANAGER',
    'ASST. HOUSEKEEPING MANAGER',
    'ASST. LAUNDRY MANAGER - CEL',
    'ASST. LAWNKEEPER',
    'ASST. SHOREX MANAGER',
    'ASST. SUSHI COOK',
    'BAKER',
    'BAKER TOURNANT',
    'BAR MANAGER',
    'BAR SERVER',
    'BAR STOREKEEPER UTILITY',
    'BARISTA',
    'BARTENDER',
    'BERTHING ADMIN ASSISTANT',
    'BEVERAGE CONTROLLER',
    'BEVERAGE TRAINER',
    'BOUTIQUE ASSISTANT MANAGER',
    'BOUTIQUE GIA SPECIALIST',
    'BOUTIQUE MANAGER',
    'BROADCAST MANAGER',
    'BROADCAST OPERATOR',
    'BUTCHER',
    'BUTLER',
    'CASH DESK MANAGER',
    'CASINO CASHIER',
    'CASINO DEALER',
    'CASINO EVENTS HOST',
    'CASINO MANAGER',
    'CASINO SUPERVISOR',
    'CDP BAKER',
    'CEL FLEET SECURITY OFFICER',
    'CEL PUBLIC SAFETY OFFICER',
    'CEL SHIPBOARD DIRECTOR CLAIMS',
    'CEL UK DECK CADET',
    'CEL UK ENGINE CADET',
    'CELEBRITY CASINO ATTENDANT',
    'CELEBRITY CASINO HOST',
    'CELEBRITY CLEANER',
    'CELEBRITY MEDIA SHOPPING GUIDE',
    'CELEBRITY MEDICAL SECRETARY',
    'CELEBRITY NURSE',
    'CELEBRITY TEMPORARY CONTRACTOR',
    'CELLAR MASTER',
    'CHEF DE PARTIE',
    'CHEF DE PARTIE 1',
    'CHEF DE PARTIE 2',
    'CHEF DE PARTIE 3',
    'CHEF DE PARTIE PASTRY',
    'CHEF DE PARTIE SUSHI',
    'CHEF DE RANG',
    'CHEF TOURNANT',
    'CHIEF CONCIERGE',
    'CHIEF ELECTRICIAN',
    'CHIEF ENGINEER CELEBRITY',
    'CHIEF NURSE CELEBRITY',
    'CHIEF OFFICER - DECK',
    'CHIEF OFFICER - MASTER',
    'CHIEF OFFICER - SAFETY',
    'CHIEF OFFICER - SAFETY MASTER',
    'CHIEF SECURITY OFC CELEBRITY',
    'CHIROPRACTOR',
    'CHILDREN ANIMATOR',
    'COMIS DE RANG',
    'COMMIS BAKER',
    'COMMIS COOK',
    'COMMIS PASTRY',
    'CONCIERGE',
    'CREW ADMIN MANAGER',
    'CREW ADMINISTRATOR',
    'CREW COUNSELOR',
    'CREW WELFARE SPECIALIST',
    'CRUISE DIRECTOR CEL',
    'CRUISE SALES ASSOCIATE',
    'CRUISE STAFF',
    'CULINARY ADMINISTRATOR',
    'CULINARY EXTERN',
    'CULINARY TOUR GUIDE',
    'CULINARY TRAINER',
    'DEALER 1',
    'DEALER 2',
    'DEALER 3',
    'DECK ATTENDANT',
    'DECK BOSUN',
    'DEPUTY CHIEF SECURITY OFFICER',
    'DIGITAL COMM ASSOCIATE',
    'DIGITAL COMMUNICATION MANAGER',
    'DIGITAL SIGN. & ITV SPECIALIST',
    'DIRECTOR REVENUE & MARKETING',
    'DISC JOCKEY',
    'DISCOVERY SHOP GUIDE',
    'DISCOVERY SHOPPING GUIDE',
    'DOCTOR',
    'DRY CLEANING SPEC - CEL',
    'ECCR STAFF ATTENDANT',
    'ENGINE STOREKEEPER',
    'ENT TECHNICAL DIRECTOR',
    'ENTERTAINMENT OPERATOR',
    'ENTERTAINMENT OPERATOR - FLY',
    'ENTERTAINMENT OPERATOR - LIGHT',
    'ENTERTAINMENT OPERATOR - SOUND',
    'ENTERTAINMENT STAGE STAFF',
    'ENVIRONMENTAL OFFICER CEL',
    'EXEC CHEF PASTRY & BAKERY',
    'EXEC SOUS CHEF',
    'EXECUTIVE CHEF',
    'F&B ADMINISTRATIVE ASSISTANT',
    'F&B DIRECTOR',
    'F&B PROVISION MASTER',
    'FINANCIAL CONTROLLER',
    'FITNESS',
    'FITTER A/C',
    'FITTER DECK',
    'FITTER ENGINE',
    'FITTER ENGINE FOREMAN',
    'FITTER REPAIRMAN',
    'FITTER TURNER',
    'FLAIR BARTENDER',
    'FLEET DIR ROOMS DIVISION NB&M',
    'FLEET DIRECTOR GUEST RELATIONS',
    'FLEET F&B DIRECTOR',
    'FLEET HOUSEKEEPING DIRECTOR',
    'FLEET PUBLIC HEALTH OFFICER',
    'FLEET RETREAT DIRECTOR',
    'FLEET REVENUE DIRECTOR',
    'FOOD STOREKEEPER',
    'FRONT DESK MANAGER',
    'GALLERY DIRECTOR',
    'GALLEY OPERATIONS MANAGER',
    'GALLEY STEWARD',
    'GALLEY UTILITY',
    'GLASSBLOWING MASTER',
    'GUEST ACCOUNTS PURSER',
    'GUEST ENTERTAINER - CEL',
    'GUEST RELATIONS DIRECTOR',
    'GUEST RELATIONS OFFICER',
    'HAIR STYLIST',
    'HEAD BAKER',
    'HEAD BUTCHER',
    'HEAD BUTLER',
    'HEAD CHEF DE RANG',
    'HEAD ENTERTAINMENT OPERATOR',
    'HEAD LOUNGE TECHNICIAN',
    'HEADWAITER CASUAL DINING',
    'HEALTH CARE ASSISTANT',
    'HOLLYWOOD HOT GLASS MGR',
    'HORTICULTURIST',
    'HOT GLASS INSTRUCTOR',
    'HOTEL ADMINISTRATIVE ASSISTANT',
    'HOTEL DIRECTOR',
    'HOTEL STOREKEEPER',
    'HOUSEKEEPING ADMINISTRATOR',
    'HOUSEKEEPING DIRECTOR',
    'HOUSEKEEPING MANAGER',
    'HOUSEKEEPING SUPERVISOR - CEL',
    'HR DIRECTOR',
    'ILOUNGE ASSISTANT',
    'INVENTORY CONTROL ASST',
    'INVENTORY MANAGER',
    'IT ASSISTANT MANAGER',
    'IT MANAGER',
    'IT OFFICER',
    'IT SUPPORT SPECIALIST',
    'IV NURSE',
    'JEWELRY ASSOCIATE',
    'JEWELRY PROFESSOR',
    'JOINER',
    'JR COMMIS BAKER',
    'JR COMMIS COOK',
    'JR COMMIS PASTRY',
    'JR CONCIERGE',
    'JR SOUS CHEF',
    'JR. GUEST RELATIONS OFFICER',
    'JUNIOR PAYROLL PURSER',
    'L&D MANAGER',
    'LAUNDRY ATTENDANT - CEL',
    'LAUNDRY MANAGER - CEL',
    'LAWNKEEPER',
    'LINE COOK',
    'LINEN UNIFORM KEEPER',
    'LUXURY SALON MANAGER',
    'M.E SOLUTIONS ELECTRICIAN',
    'M.E SOLUTIONS PIPE FITTER',
    'M.E SOLUTIONS SUPERVISOR',
    'M.E SOLUTIONS TECHNICIAN',
    'M.E SOLUTIONS WELDER',
    'MACOLOGIST',
    'MAITRE D\' SPECIALTY RESTAURANT',
    'MANAGER CRUISE SALES',
    'MARINE ADMINISTRATIVE ASSISTAN',
    'MASSAGE THERAPIST',
    'MASSAGE/ESTHETICIAN',
    'MASTER',
    'MEDISPA DOCTOR',
    'MEDISPA NURSE',
    'MOLECULAR BARTENDER',
    'MOTORMAN',
    'MOTORMAN 1 CELEBRITY',
    'MUSICAL DIRECTOR',
    'NAIL TECHNICIAN',
    'NIGHT ATTENDANT',
    'NURSE PRACTITIONER',
    'OBSERVER CADET',
    'OILER CELEBRITY',
    'ONBOARD DIGITAL MANAGER',
    'ORCHESTRA MUSICIAN',
    'PANTRY CHEF',
    'PARAMEDIC',
    'PASTRY COOK',
    'PASTRY TOURNANT',
    'PHOTO ARTIST',
    'PHYSIOTHERAPIST',
    'PLUMBER CELEBRITY',
    'POOL DECK MONITOR',
    'PREMIER MUSICIAN',
    'PREMIERE SPECIALTY ACT',
    'PRINT SPECIALIST',
    'PRINTER',
    'PRIVATE BEVERAGE ATTENDANT',
    'PRODUCTION CAST DANCE CAPTAIN',
    'PRODUCTION CAST DANCERS',
    'PRODUCTION CAST SINGER',
    'PRODUCTION CAST SINGER/DANCER',
    'PROJECT IT MANAGER',
    'PROJECT SECURITY OFFICER',
    'PUB HEALTH & SAFETY SPECIALIST',
    'PUBLIC HEALTH OFFICER',
    'REFRIGERATION ENGINEER',
    'RECEPTIONIST',
    'RESTAURANT HOST/ESS',
    'RESTAURANT OPERATIONS MANAGER',
    'RESTAURANT TRAINER',
    'RETREAT CONCIERGE',
    'RETREAT MANAGER',
    'ROOM SERVICE ATTENDANT',
    'ROOM SERVICE MANAGER',
    'ROOM SERVICE OPERATOR',
    'SAFETY ADMINISTRATOR',
    'SAILOR A/B',
    'SAILOR O/S',
    'SALON STAFF',
    'SANITATION ENGINEER',
    'SECURITY GUARD CELEBRITY',
    'SECURITY GUARD SUPV.',
    'SENIOR BARISTA',
    'SENIOR BARTENDER',
    'SENIOR BEVERAGE MANAGER',
    'SENIOR BROADCAST MANAGER',
    'SENIOR FLAIR BARTENDER',
    'SENIOR MOLECULAR BARTENDER',
    'SHOP MANAGER (HARDING)',
    'SHOP MANAGER-ASST. (HARDING)',
    'SHOP STAFF (HARDING)',
    'SHORE EXCURSION STAFF',
    'SKIN CARE SPECIALIST',
    'SLOT MANAGER',
    'SLOT TECHNICIAN',
    'SNACK ATTENDANT CASUAL DINING',
    'SOLO MUSICIAN',
    'SOMMELIER',
    'SOUS CHEF',
    'SPA CONCIERGE',
    'SPA DIRECTOR',
    'SPECIALIZED AESTHETICS',
    'SPECIALTY PRODUCTION ACT',
    'SPECIALTY PRODUCTION DANCER',
    'SPECIALTY SHOP MANAGER',
    'SPECIALTY SKETCH ARTIST PROD',
    'SPECIALTY VOCALIST',
    'SPORTS INSTRUCTOR',
    'SR DESKTOP PUBLISHER',
    'SR DESTINATIONS MANAGER',
    'SR TRVL HOTEL DIRECTOR',
    'SR. ASST. BEVERAGE MANAGER',
    'SR. DOCTOR',
    'STAFF ATTENDANT',
    'STAFF CAPTAIN CELEBRITY',
    'STAFF ENGINEER',
    'STAGE & PRODUCTION MANAGER',
    'STATEROOM ATTENDANT',
    'STORE ASSOCIATE',
    'STORE MANAGER',
    'STUDIO ARTIST',
    'SUSHI COOK',
    'TAILOR UNIFORM KEEPER',
    'TRAV VIBRATION & ALIGNMENT ENG',
    'TRAVELING BEVERAGE OPS MGR',
    'TRAVELING CASINO HOST',
    'TRAVELING CASINO MANAGER',
    'TRAVELING CHIEF NURSE',
    'TRAVELING CORPORATE CHEF',
    'TRAVELING CRUISE DIRECTOR',
    'TRAVELING CRUISE SALES MANAGER',
    'TRAVELING DIGITAL COMM MANAGER',
    'TRAVELING DOCTOR',
    'TRAVELING ENT TECH DIRECTOR',
    'TRAVELING F&B COST ANALYST',
    'TRAVELING FINANCIAL CONTROLLER',
    'TRAVELING GUARANTEE ENGINEER',
    'TRAVELING HOTEL DIRECTOR',
    'TRAVELING HR BUSINESS PARTNER',
    'TRAVELING ILOUNG MANAGER',
    'TRAVELING L&D MANAGER',
    'TRAVELING LAUNDRY MANAGER',
    'TRAVELING NURSE',
    'TRAVELING SR. DOCTOR',
    'TRVL CASINO PROJECT & CPL MGR',
    'TRVL GALLEY OPS MGR',
    'TRVL INTERNATIONAL HOST/ESS',
    'TRVL PHOTO OPS MGR',
    'TRVL PRODUCT DEVELOPMENT MGR',
    'TRVL SERVICE EXCELLENCE DIR.',
    'TRVL SR. BROADCAST MGR',
    'TRVL STAGE & PROD. MGR',
    'TRVL TECH. OPERATIONS MANAGER',
    'TRVL. SHORE EXCURSION MANAGER',
    'UPHOLSTERER CELEBRITY',
    'UTILITY BAR',
    'VARNISHER',
    'VENUE MUSICIAN',
    'VENUE PRODUCTION MANAGER',
    'WAITER',
    'WAITER LUMINAE',
    'WARDROBE SPEC / ENT ADMIN',
    'WASH SPECIALIST - CEL',
    'WIPERS',
    'YOUTH COUNSELOR',
    'YOUTH COUNSELOR SEASONAL',
    'YOUTH PROGRAM MANAGER',
    'SHOP ATTENDANT'
  ];

  // Map job titles to default CL codes (can be customized)
  // For now, we'll use CL200 as default for most positions
  var DEFAULT_CL_CODE = 'CL200';

  var ss = getConfigSheet_();
  var sheet = ss.getSheetByName('JOBS');
  if (!sheet) {
    Logger.log('JOBS sheet does not exist');
    return { ok: false, error: 'JOBS sheet not found' };
  }

  var existingData = sheet.getDataRange().getValues();
  var existingJobs = {};
  for (var i = 1; i < existingData.length; i++) {
    var brand = String(existingData[i][0]).toUpperCase();
    var title = String(existingData[i][1]).toUpperCase();
    existingJobs[brand + '|' + title] = true;
  }

  var added = 0;
  var skipped = 0;
  var now = new Date().toISOString();

  for (var j = 0; j < JOB_TITLES.length; j++) {
    var title = JOB_TITLES[j];
    var key = 'ROYAL|' + title;

    if (existingJobs[key]) {
      skipped++;
      continue;
    }

    sheet.appendRow([
      'ROYAL',           // Brand
      title,             // Job Title
      DEFAULT_CL_CODE,   // Default CL Code
      '',                // Department (optional)
      true               // Active
    ]);

    added++;
  }

  Logger.log('Job titles migration complete. Added: %s, Skipped: %s', added, skipped);
  return { ok: true, added: added, skipped: skipped };
}

