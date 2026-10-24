import mongoose from "mongoose";
import imagekit from "../config/imageKit.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Tractor from "../models/tractor.js";
import AuditLog from "../models/AuditLog.js";

const audit = (user, action, req, details = {}) => AuditLog.create({
    user: user?._id,
    action,
    ipAddress: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || '',
    userAgent: req.get('user-agent') || '',
    details
}).catch((error) => console.error('Audit log failed:', error.message));

export const changeRoleToOwner = async (req, res) => {
    try {
        const { _id } = req.user;
        const updatedUser = await User.findByIdAndUpdate(
            _id, 
            { role: 'owner' }, 
            { new: true }
        ).select('-password -sessions -twoFactor');
        
        await audit(req.user, 'role_changed_to_owner', req);
        return res.json({ 
            success: true, 
            message: 'Now you can list tractors as an owner', 
            user: updatedUser 
        });
    } catch (error) {
        console.error('changeRoleToOwner error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to List Tractor
export const addTractor = async (req, res) => {
    try {
        const { _id } = req.user;
        
        // Support tractorData whether sent as a JSON string or as flat form-data fields
        let submittedData = {};
        if (req.body.tractorData) {
            try {
                submittedData = typeof req.body.tractorData === 'string'
                    ? JSON.parse(req.body.tractorData)
                    : req.body.tractorData;
            } catch (err) {
                return res.status(400).json({ success: false, message: 'Invalid JSON payload in tractorData' });
            }
        } else {
            submittedData = { ...req.body };
        }

        // Parse implementsAvailable safely if passed as stringified JSON in form-data
        let implementsList = [
            { name: "Rotavator (42-blades)", pricePerDay: 500, pricePerHour: 150, pricePerAcre: 300 },
            { name: "Cultivator / Harrow (9-tyne)", pricePerDay: 300, pricePerHour: 100, pricePerAcre: 200 },
            { name: "MB Reversible Plough", pricePerDay: 400, pricePerHour: 120, pricePerAcre: 250 },
            { name: "Heavy Duty Tipping Trolley", pricePerDay: 600, pricePerHour: 180, pricePerAcre: 350 }
        ];

        if (submittedData.implementsAvailable) {
            if (typeof submittedData.implementsAvailable === 'string') {
                try {
                    implementsList = JSON.parse(submittedData.implementsAvailable);
                } catch {
                    // Keep default if parsing fails
                }
            } else if (Array.isArray(submittedData.implementsAvailable)) {
                implementsList = submittedData.implementsAvailable;
            }
        }

        const tractorData = {
            brand: submittedData.brand ? String(submittedData.brand).trim() : '',
            model: submittedData.model ? String(submittedData.model).trim() : '',
            year: Number(submittedData.year),
            category: submittedData.category ? String(submittedData.category).trim() : 'Tractor',
            seatingCapacity: Number(submittedData.seatingCapacity ?? submittedData.seating_capacity ?? 1),
            fuelType: submittedData.fuelType ?? submittedData.fuel_type ?? 'Diesel',
            transmission: submittedData.transmission ?? submittedData.transmissionType ?? 'Manual',
            pricePerDay: Number(submittedData.pricePerDay || 0),
            pricePerHour: Number(submittedData.pricePerHour || 600),
            pricePerAcre: Number(submittedData.pricePerAcre || 1200),
            horsePower: Number(submittedData.horsePower || 50),
            transportRatePerKm: Number(submittedData.transportRatePerKm || 40),
            driverDailyRate: Number(submittedData.driverDailyRate || 500),
            driverHourlyRate: Number(submittedData.driverHourlyRate || 100),
            state: submittedData.state ?? 'Uttar Pradesh',
            district: submittedData.district ? String(submittedData.district).trim() : '',
            block: submittedData.block ? String(submittedData.block).trim() : '',
            villageOrLandmark: submittedData.villageOrLandmark ? String(submittedData.villageOrLandmark).trim() : '',
            location: submittedData.location ? String(submittedData.location).trim() : '',
            description: submittedData.description ? String(submittedData.description).trim() : '',
            driverAvailable: submittedData.driverAvailable !== undefined ? Boolean(submittedData.driverAvailable) : true,
            implementsAvailable: implementsList
        };

        // Validate required fields
        const requiredFields = ['brand', 'model', 'year', 'location', 'description', 'pricePerDay'];
        for (const field of requiredFields) {
            if (!tractorData[field]) {
                return res.status(400).json({ success: false, message: `Field '${field}' is required and cannot be empty.` });
            }
        }

        const imageFile = req.file;
        let imageUrl = submittedData.image || '';

        if (imageFile) {
            if (!imagekit) {
                return res.status(500).json({ success: false, message: 'ImageKit is not configured. Please check environment variables.' });
            }

            const response = await imagekit.upload({
                file: imageFile.buffer,
                fileName: `tractor_${Date.now()}_${imageFile.originalname}`,
                folder: '/tractors'
            });

            imageUrl = imagekit.url({
                path: response.filePath,
                transformation: [
                    { width: '1280' },
                    { quality: 'auto' },
                    { format: 'webp' }
                ]
            }) || response.url;
        }

        if (!imageUrl) {
            return res.status(400).json({ success: false, message: 'Image upload is required for listing a tractor' });
        }

        const tractor = await Tractor.create({
            ...tractorData,
            owner: _id,
            image: imageUrl
        });

        return res.status(201).json({ success: true, message: 'Tractor added successfully', tractor });
    } catch (error) {
        console.error('addTractor error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to List Owner's Tractors
export const getOwnerTractors = async (req, res) => {
    try {
        const { _id } = req.user;
        const tractors = await Tractor.find({ owner: _id }).sort({ createdAt: -1 });
        return res.json({ success: true, tractors });
    } catch (error) {
        console.error('getOwnerTractors error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to Toggle Tractor Availability
export const toggleTractorAvailability = async (req, res) => {
    try {
        const { tractorId } = req.params;
        const { _id } = req.user;

        if (!tractorId || !mongoose.isValidObjectId(tractorId)) {
            return res.status(400).json({ success: false, message: 'Invalid tractor ID' });
        }

        const tractorDoc = await Tractor.findOne({ owner: _id, _id: tractorId });
        if (!tractorDoc) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
        }

        tractorDoc.isAvailable = !tractorDoc.isAvailable;
        await tractorDoc.save();

        return res.json({ 
            success: true, 
            message: `Tractor availability changed to ${tractorDoc.isAvailable ? 'available' : 'unavailable'}`, 
            tractor: tractorDoc 
        });
    } catch (error) {
        console.error('toggleTractorAvailability error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to Delete Tractor
export const deleteTractor = async (req, res) => {
    try {
        const { tractorId } = req.params;
        const { _id } = req.user;

        if (!tractorId || !mongoose.isValidObjectId(tractorId)) {
            return res.status(400).json({ success: false, message: 'Invalid tractor ID' });
        }

        const tractorDoc = await Tractor.findOne({ owner: _id, _id: tractorId });
        if (!tractorDoc) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
        }

        // Guard: Prevent deletion if there are active or upcoming bookings
        const activeBooking = await Booking.findOne({
            tractor: tractorId,
            status: { $in: ['pending', 'confirmed'] },
            endDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });

        if (activeBooking) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete tractor with pending or confirmed bookings. Please cancel or complete them first.'
            });
        }

        await tractorDoc.deleteOne();
        return res.json({ success: true, message: 'Tractor deleted successfully' });
    } catch (error) {
        console.error('deleteTractor error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to Update Tractor Details
export const updateTractor = async (req, res) => {
    try {
        const { tractorId } = req.params;
        const { _id } = req.user;

        if (!tractorId || !mongoose.isValidObjectId(tractorId)) {
            return res.status(400).json({ success: false, message: 'Invalid tractor ID' });
        }

        const tractorDoc = await Tractor.findOne({ owner: _id, _id: tractorId });
        if (!tractorDoc) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
        }

        const allowedFields = [
            'brand', 'model', 'year', 'category', 'seatingCapacity',
            'fuelType', 'transmission', 'pricePerDay', 'pricePerHour', 'pricePerAcre',
            'horsePower', 'transportRatePerKm', 'state', 'district', 'block', 'villageOrLandmark', 'location', 'description', 'isAvailable',
            'driverDailyRate', 'driverHourlyRate', 'driverAvailable', 'implementsAvailable'
        ];

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                if (field === 'implementsAvailable' && typeof req.body[field] === 'string') {
                    try {
                        tractorDoc[field] = JSON.parse(req.body[field]);
                    } catch {
                        // ignore malformed string
                    }
                } else {
                    tractorDoc[field] = req.body[field];
                }
            }
        });

        // Allow updating tractor image if a new image file is provided
        if (req.file && imagekit) {
            const response = await imagekit.upload({
                file: req.file.buffer,
                fileName: `tractor_${Date.now()}_${req.file.originalname}`,
                folder: '/tractors'
            });

            tractorDoc.image = imagekit.url({
                path: response.filePath,
                transformation: [
                    { width: '1280' },
                    { quality: 'auto' },
                    { format: 'webp' }
                ]
            }) || response.url;
        }

        await tractorDoc.save();
        return res.json({ success: true, message: 'Tractor details updated successfully', tractor: tractorDoc });
    } catch (error) {
        console.error('updateTractor error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to Toggle Blocked Maintenance Date for a Tractor
export const toggleDateBlock = async (req, res) => {
    try {
        const { tractorId } = req.params;
        const { date } = req.body; // YYYY-MM-DD
        const { _id } = req.user;

        if (!tractorId || !mongoose.isValidObjectId(tractorId)) {
            return res.status(400).json({ success: false, message: 'Invalid tractor ID' });
        }

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ success: false, message: 'Date is required in format YYYY-MM-DD' });
        }

        const tractor = await Tractor.findOne({ _id: tractorId, owner: _id });
        if (!tractor) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
        }

        const blockedDates = tractor.blockedDates || [];
        const index = blockedDates.indexOf(date);

        if (index > -1) {
            blockedDates.splice(index, 1);
        } else {
            blockedDates.push(date);
        }

        tractor.blockedDates = blockedDates;
        await tractor.save();

        res.json({
            success: true,
            message: index > -1 ? `Unblocked date ${date}` : `Blocked date ${date} for maintenance`,
            blockedDates: tractor.blockedDates
        });
    } catch (error) {
        console.error('toggleDateBlock error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to Assign Driver/Operator to a Booking
export const assignOperator = async (req, res) => {
    try {
        const { bookingId } = req.params;
        const { name, phone } = req.body;
        const { _id } = req.user;

        if (!bookingId || !mongoose.isValidObjectId(bookingId)) {
            return res.status(400).json({ success: false, message: 'Invalid booking ID' });
        }

        const booking = await Booking.findOne({ _id: bookingId, owner: _id });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        booking.operatorAssigned = {
            name: name ? String(name).trim() : '',
            phone: phone ? String(phone).trim() : ''
        };
        await booking.save();

        res.json({ success: true, message: 'Operator assigned successfully', operator: booking.operatorAssigned });
    } catch (error) {
        console.error('assignOperator error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API To get Dashboard Data
export const getDashboardData = async (req, res) => {
    try {
        const { _id } = req.user;

        const tractors = await Tractor.find({ owner: _id });
        const bookings = await Booking.find({ owner: _id })
            .populate('tractor')
            .populate({ path: 'user', select: 'name email phone' })
            .sort({ createdAt: -1 });

        // Filter bookings by status
        const pendingBooking = bookings.filter((b) => b.status === 'pending');
        const completedBooking = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
        const cancelledBooking = bookings.filter((b) => b.status === 'cancelled');

        const totalRevenue = completedBooking.reduce((acc, booking) => acc + Number(booking.price || 0), 0);

        // Monthly revenue stats for current calendar year
        const currentYear = new Date().getFullYear();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthlyStats = {};
        months.forEach((m) => { monthlyStats[m] = 0; });
        
        bookings.forEach((b) => {
            if ((b.status === 'confirmed' || b.status === 'completed') && b.createdAt) {
                const bDate = new Date(b.createdAt);
                if (bDate.getFullYear() === currentYear) {
                    const monthName = months[bDate.getMonth()];
                    monthlyStats[monthName] = (monthlyStats[monthName] || 0) + Number(b.price || 0);
                }
            }
        });

        const revenueChartData = Object.keys(monthlyStats).map((month) => ({
            month,
            revenue: monthlyStats[month]
        }));

        const statusChartData = [
            { name: 'Confirmed', count: completedBooking.length, color: '#16a34a' },
            { name: 'Pending', count: pendingBooking.length, color: '#2563eb' },
            { name: 'Cancelled', count: cancelledBooking.length, color: '#dc2626' }
        ];

        const dashboardData = {
            totalTractor: tractors.length,
            totalBooking: bookings.length,
            pendingBooking: pendingBooking.length,
            completedBooking: completedBooking.length,
            recentBooking: bookings.slice(0, 5),
            monthlyRevenue: totalRevenue,
            totalRevenue,
            revenueChartData,
            statusChartData
        };

        res.json({ success: true, dashboardData });
    } catch (error) {
        console.error('getDashboardData error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to Update user image - prevents sensitive data leak
export const updateUserImage = async (req, res) => {
    try {
        const { _id } = req.user;
        const imageFile = req.file;

        if (!imageFile) {
            return res.status(400).json({ success: false, message: 'Image upload is required' });
        }

        if (!imagekit) {
            return res.status(500).json({ success: false, message: 'ImageKit is not configured. Please check environment variables.' });
        }

        // Direct upload from memory buffer
        const response = await imagekit.upload({
            file: imageFile.buffer,
            fileName: `user_${_id}_${Date.now()}_${imageFile.originalname}`,
            folder: '/users'
        });

        const optimizedImageUrl = imagekit.url({
            path: response.filePath,
            transformation: [
                { width: '400' },
                { quality: 'auto' },
                { format: 'webp' }
            ]
        }) || response.url;

        await User.findByIdAndUpdate(_id, { image: optimizedImageUrl });
        
        const safeUser = await User.findById(_id).select('-password -sessions -twoFactor');
        
        res.json({ 
            success: true, 
            message: 'Profile image updated successfully', 
            image: optimizedImageUrl, 
            user: safeUser 
        });
    } catch (error) {
        console.error('updateUserImage error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};
