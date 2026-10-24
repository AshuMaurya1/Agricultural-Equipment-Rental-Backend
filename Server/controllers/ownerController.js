import imagekit from "../config/imageKit.js";
import Booking from "../models/Booking.js";
import User from "../models/User.js";
import Tractor from "../models/tractor.js";

export const changeRoleToOwner = async (req, res) => {
    try {
        const { _id } = req.user;
        await User.findByIdAndUpdate(_id, { role: 'owner' }, { new: true });
        return res.json({ success: true, message: 'Now you can list tractors' });
    } catch (error) {
        console.error('changeRoleToOwner error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// API to List Tractor
export const addTractor = async (req, res) => {
    try {
        const { _id } = req.user;
        
        let submittedData = {};
        if (req.body.tractorData) {
            try {
                submittedData = typeof req.body.tractorData === 'string'
                    ? JSON.parse(req.body.tractorData)
                    : req.body.tractorData;
            } catch (err) {
                return res.status(400).json({ success: false, message: 'Invalid JSON payload in tractorData' });
            }
        }

        const tractorData = {
            ...submittedData,
            seatingCapacity: submittedData.seatingCapacity ?? submittedData.seating_capacity ?? 1,
            fuelType: submittedData.fuelType ?? submittedData.fuel_type ?? 'Diesel',
            transmission: submittedData.transmission ?? submittedData.transmissionType ?? 'Manual',
            horsePower: Number(submittedData.horsePower || 50),
            pricePerHour: Number(submittedData.pricePerHour || 600),
            pricePerAcre: Number(submittedData.pricePerAcre || 1200),
            transportRatePerKm: Number(submittedData.transportRatePerKm || 40),
            driverDailyRate: Number(submittedData.driverDailyRate || 500),
            driverHourlyRate: Number(submittedData.driverHourlyRate || 100),
            driverAvailable: submittedData.driverAvailable ?? true,
            implementsAvailable: submittedData.implementsAvailable ?? [
                { name: "Rotavator (42-blades)", pricePerDay: 500, pricePerHour: 150, pricePerAcre: 300 },
                { name: "Cultivator / Harrow (9-tyne)", pricePerDay: 300, pricePerHour: 100, pricePerAcre: 200 },
                { name: "MB Reversible Plough", pricePerDay: 400, pricePerHour: 120, pricePerAcre: 250 },
                { name: "Heavy Duty Tipping Trolley", pricePerDay: 600, pricePerHour: 180, pricePerAcre: 350 }
            ]
        };

        const imageFile = req.file;
        if (!imageFile) {
            return res.status(400).json({ success: false, message: 'Image upload is required' });
        }

        if (!imagekit) {
            return res.status(500).json({ success: false, message: 'ImageKit is not configured. Please check environment variables.' });
        }

        // Upload directly from memory buffer
        const response = await imagekit.upload({
            file: imageFile.buffer,
            fileName: imageFile.originalname,
            folder: '/tractors'
        });

        const optimizedImageUrl = imagekit.url({
            path: response.filePath,
            transformation: [
                { width: '1280' },
                { quality: 'auto' },
                { format: 'webp' }
            ]
        });

        const tractor = await Tractor.create({
            ...tractorData,
            owner: _id,
            image: optimizedImageUrl
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
        const tractors = await Tractor.find({ owner: _id });
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
        const tractorDoc = await Tractor.findOne({ owner: _id, _id: tractorId });

        if (!tractorDoc) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
        }

        tractorDoc.isAvailable = !tractorDoc.isAvailable;
        await tractorDoc.save();

        return res.json({ success: true, message: 'Availability toggled successfully', tractor: tractorDoc });
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
        const tractorDoc = await Tractor.findOne({ owner: _id, _id: tractorId });

        if (!tractorDoc) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
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
        const tractorDoc = await Tractor.findOne({ owner: _id, _id: tractorId });

        if (!tractorDoc) {
            return res.status(404).json({ success: false, message: 'Tractor not found' });
        }

        const allowedFields = [
            'brand', 'model', 'year', 'category', 'seatingCapacity',
            'fuelType', 'transmission', 'pricePerDay', 'pricePerHour', 'pricePerAcre',
            'horsePower', 'transportRatePerKm', 'location', 'description', 'isAvailable',
            'driverDailyRate', 'driverHourlyRate', 'driverAvailable', 'implementsAvailable'
        ];

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                tractorDoc[field] = req.body[field];
            }
        });

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

        if (!date) {
            return res.status(400).json({ success: false, message: 'Date is required (YYYY-MM-DD)' });
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

        const booking = await Booking.findOne({ _id: bookingId, owner: _id });
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        booking.operatorAssigned = {
            name: name ? name.trim() : '',
            phone: phone ? phone.trim() : ''
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
            .populate({ path: 'user', select: 'name email' })
            .sort({ createdAt: -1 });

        // Filter in-memory to prevent multiple redundant database round-trips
        const pendingBooking = bookings.filter((b) => b.status === 'pending');
        const completedBooking = bookings.filter((b) => b.status === 'confirmed');
        const cancelledBooking = bookings.filter((b) => b.status === 'cancelled');

        const totalRevenue = completedBooking.reduce((acc, booking) => acc + (booking.price || 0), 0);

        // Monthly revenue stats for current calendar year
        const currentYear = new Date().getFullYear();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthlyStats = {};
        months.forEach((m) => { monthlyStats[m] = 0; });
        
        bookings.forEach((b) => {
            if (b.status === 'confirmed' && b.createdAt) {
                const bDate = new Date(b.createdAt);
                if (bDate.getFullYear() === currentYear) {
                    const monthName = months[bDate.getMonth()];
                    monthlyStats[monthName] = (monthlyStats[monthName] || 0) + (b.price || 0);
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
            fileName: imageFile.originalname,
            folder: '/users'
        });

        const optimizedImageUrl = imagekit.url({
            path: response.filePath,
            transformation: [
                { width: '400' },
                { quality: 'auto' },
                { format: 'webp' }
            ]
        });

        const image = optimizedImageUrl;
        await User.findByIdAndUpdate(_id, { image });
        
        // Exclude passwords, active sessions, and 2FA secrets from the response
        const safeUser = await User.findById(_id).select('-password -sessions -twoFactor');
        
        res.json({ 
            success: true, 
            message: 'User image updated successfully', 
            image, 
            user: safeUser 
        });
    } catch (error) {
        console.error('updateUserImage error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
    }
};
