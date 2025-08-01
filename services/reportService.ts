
import * as XLSX from 'xlsx';
import { EmployeeData, AttendanceRecord, AttendanceStatus, Holiday, Stat } from '../types';
import { WEEKEND_DAYS, FULL_DAY_HOURS, HALF_DAY_HOURS } from '../constants';

export const getStatus = (record: AttendanceRecord, holidayDates: Set<string>): AttendanceStatus => {
  const dateString = record.date.toISOString().split('T')[0];
  const dayOfWeek = record.date.getDay();

  const isHoliday = holidayDates.has(dateString);
  const isWeekend = WEEKEND_DAYS.includes(dayOfWeek);
  
  if (record.workHoursDecimal > 0) {
    if (isHoliday) return AttendanceStatus.WORK_ON_HOLIDAY;
    if (isWeekend) return AttendanceStatus.WORK_ON_WEEKEND;
    if (record.workHoursDecimal >= FULL_DAY_HOURS) return AttendanceStatus.PRESENT;
    if (record.workHoursDecimal >= HALF_DAY_HOURS) return AttendanceStatus.SHORT_HOURS;
    return AttendanceStatus.HALF_DAY;
  } else {
    // If reason indicates Out of Office, it might be Present. This is handled during record update.
    if(record.reason === 'Out of Office' && record.workHoursDecimal === FULL_DAY_HOURS) return AttendanceStatus.PRESENT;
    if (isHoliday) return AttendanceStatus.HOLIDAY;
    if (isWeekend) return AttendanceStatus.WEEKEND;
    return AttendanceStatus.ABSENT;
  }
};

export const decimalToTimeString = (decimalHours: number): string => {
    if (isNaN(decimalHours) || decimalHours < 0) return '0:00';
    const totalMinutes = Math.round(decimalHours * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};


export const analyzeData = (employees: EmployeeData[], holidays: Holiday[]): EmployeeData[] => {
    if (employees.length === 0) return [];
    
    const holidayDates = new Set(holidays.map(h => h.date));
    
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const employee of employees) {
        for (const record of employee.records) {
            const recordDate = new Date(record.date);
            if (!minDate || recordDate < minDate) minDate = recordDate;
            if (!maxDate || recordDate > maxDate) maxDate = recordDate;
        }
    }

    if (!minDate || !maxDate) return employees;
    
    const analyzedEmployees: EmployeeData[] = [];

    for (const employee of employees) {
        const recordsMap = new Map<string, AttendanceRecord>(
            employee.records.map(r => [new Date(r.date).toISOString().split('T')[0], {...r, date: new Date(r.date)}])
        );

        const newRecords: AttendanceRecord[] = [];
        const currentDate = new Date(minDate);
        
        while (currentDate <= maxDate) {
            const dateString = currentDate.toISOString().split('T')[0];
            let record = recordsMap.get(dateString);

            if (!record) {
                record = {
                    id: `${employee.employeeName}-${dateString}`,
                    date: new Date(currentDate),
                    name: employee.employeeName,
                    inTime: null,
                    outTime: null,
                    totalHours: null,
                    workHoursDecimal: 0,
                    status: AttendanceStatus.UNKNOWN,
                    reason: '',
                    isAiEnhanced: false,
                };
            }
            
            record.status = getStatus(record, holidayDates);
            newRecords.push(record);

            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        analyzedEmployees.push({
            employeeName: employee.employeeName,
            records: newRecords.sort((a,b) => a.date.getTime() - b.date.getTime()),
        });
    }

    return analyzedEmployees;
};

export const generateSummaryStats = (records: AttendanceRecord[]): Stat[] => {
    const totalDays = records.length;
    const present = records.filter(r => r.status === AttendanceStatus.PRESENT).length;
    const absent = records.filter(r => r.status === AttendanceStatus.ABSENT).length;
    const halfDays = records.filter(r => r.status === AttendanceStatus.HALF_DAY).length;
    const shortHours = records.filter(r => r.status === AttendanceStatus.SHORT_HOURS).length;
    const holidays = records.filter(r => r.status === AttendanceStatus.HOLIDAY || r.status === AttendanceStatus.WORK_ON_HOLIDAY).length;
    const weekends = records.filter(r => r.status === AttendanceStatus.WEEKEND || r.status === AttendanceStatus.WORK_ON_WEEKEND).length;
    const workOnHoliday = records.filter(r => r.status === AttendanceStatus.WORK_ON_HOLIDAY).length;
    
    const totalWorkableDays = totalDays - holidays - weekends;
    const totalHoursDecimal = records.reduce((sum, r) => sum + r.workHoursDecimal, 0);
    const totalHoursFormatted = decimalToTimeString(totalHoursDecimal);
    
    return [
        { label: 'Total Workable Days', value: totalWorkableDays, color: 'bg-blue-500' },
        { label: 'Present Days', value: present, color: 'bg-green-500' },
        { label: 'Absent Days', value: absent, color: 'bg-red-500' },
        { label: 'Short/Half Days', value: `${shortHours}/${halfDays}`, color: 'bg-yellow-500' },
        { label: 'Work on Holiday', value: workOnHoliday, color: 'bg-purple-500' },
        { label: 'Total Hours Worked', value: totalHoursFormatted, color: 'bg-slate-700', totalHoursDecimal },
    ];
};


const EXCEL_STATUS_FILLS: Record<AttendanceStatus, string> = {
    [AttendanceStatus.PRESENT]: "dcfce7",
    [AttendanceStatus.ABSENT]: "fee2e2",
    [AttendanceStatus.HALF_DAY]: "fef9c3",
    [AttendanceStatus.SHORT_HOURS]: "fef3c7",
    [AttendanceStatus.WEEKEND]: "e2e8f0",
    [AttendanceStatus.HOLIDAY]: "e0f2fe",
    [AttendanceStatus.WORK_ON_HOLIDAY]: "e9d5ff",
    [AttendanceStatus.WORK_ON_WEEKEND]: "e0e7ff",
    [AttendanceStatus.UNKNOWN]: "f3f4f6",
};

export const exportToExcel = (records: AttendanceRecord[], summary: Stat[], employeeName: string, dateRange: {start: Date, end: Date}) => {
    // Sheet 1: Summary
    const summaryData = [
        ['Employee Attendance Summary'],
        [],
        ['Employee Name:', employeeName],
        ['Period:', `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`],
        [],
        ['Metric', 'Value'],
        ...summary.map(s => [s.label, s.value])
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 25 }, { wch: 15 }];
    summaryWs['A1'].s = { font: { bold: true, sz: 16 }, alignment: { horizontal: 'center' } };
    XLSX.utils.sheet_add_aoa(summaryWs, [['']], {origin: 'A1'}); // Recalculate merges
    summaryWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    
    // Sheet 2: Detailed Report
    const headers = ['Date', 'Day', 'In Time', 'Out Time', 'Total Hours', 'Status', 'Reason / Note'];
    const reportData = records.map(r => ({
        Date: r.date.toLocaleDateString(),
        Day: r.date.toLocaleDateString('en-US', { weekday: 'long'}),
        InTime: r.inTime || '-',
        OutTime: r.outTime || '-',
        TotalHours: r.totalHours || '0:00',
        Status: r.status,
        Reason: r.reason || '-',
    }));

    const reportWs = XLSX.utils.json_to_sheet(reportData, { header: headers });
    reportWs['!cols'] = [ { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 40 } ];

    // Style headers
    const headerStyle = { font: { bold: true }, fill: { fgColor: { rgb: "d1d5db" } }, alignment: { horizontal: 'center' } };
    for (let C = 0; C < headers.length; ++C) {
        const cellAddress = XLSX.utils.encode_cell({c: C, r: 0});
        reportWs[cellAddress].s = headerStyle;
    }

    // Style data rows
    records.forEach((record, index) => {
        const rowNum = index + 1; // 0-indexed data, +1 for header
        const fillColor = EXCEL_STATUS_FILLS[record.status];
        const rowStyle = { fill: { fgColor: { rgb: fillColor } } };
        for (let C = 0; C < headers.length; ++C) {
            const cellAddress = XLSX.utils.encode_cell({c: C, r: rowNum});
            if (!reportWs[cellAddress]) continue;
            reportWs[cellAddress].s = rowStyle;
        }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    XLSX.utils.book_append_sheet(wb, reportWs, 'Detailed Report');

    XLSX.writeFile(wb, `Attendance_Report_${employeeName.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
};